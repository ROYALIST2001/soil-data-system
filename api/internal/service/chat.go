package service

import (
	"fmt"
	"regexp"
	"strings"

	"soil-data-system/api/internal/client"
	"soil-data-system/api/internal/model"
	"soil-data-system/api/internal/repository"
)

// THE SAFETY LIMIT.
//
// An agent loop can run FOREVER if the LLM keeps calling tools
// and never answers. Then: your API bill grows, the farmer waits,
// and the request never finishes.
//
// WHY 5? Our hardest question needs 3 tools. 5 gives room without risk.
//
// EVERY AGENT LOOP MUST HAVE A LIMIT. This is not optional.
const maxAgentRounds = 5

var referencePattern = regexp.MustCompile(`\[(?:B|W)\d+\]`)

// Only server-returned references may appear in the answer and source cards.
func citedSources(answer string, sources []model.ChatSource) (string, []model.ChatSource) {
	allowed := make(map[string]bool)
	for _, source := range sources {
		allowed["["+source.ID+"]"] = true
	}
	answer = referencePattern.ReplaceAllStringFunc(answer, func(citation string) string {
		if allowed[citation] {
			return citation
		}
		return ""
	})
	selected := make([]model.ChatSource, 0)
	for _, source := range sources {
		if strings.Contains(answer, "["+source.ID+"]") {
			selected = append(selected, source)
		}
	}
	return strings.TrimSpace(answer), selected
}

// ChatService drives the agent loop and executes the tools.
type ChatService struct {
	readingRepo  *repository.ReadingRepository
	readingSvc   *ReadingService
	analyticsSvc *AnalyticsService
	locationSvc  *LocationService
	aiClient     *client.AIClient
}

// NewChatService builds the service.
func NewChatService(
	readingRepo *repository.ReadingRepository,
	readingSvc *ReadingService,
	analyticsSvc *AnalyticsService,
	locationSvc *LocationService,
	aiClient *client.AIClient,
) *ChatService {
	return &ChatService{
		readingRepo:  readingRepo,
		readingSvc:   readingSvc,
		analyticsSvc: analyticsSvc,
		locationSvc:  locationSvc,
		aiClient:     aiClient,
	}
}

// Chat answers one farmer message, using the agent loop.
func (s *ChatService) Chat(req model.ChatRequest) (model.ChatResponse, error) {

	var empty model.ChatResponse

	// ---------- Work out which reading we are talking about ----------
	var reading model.Reading
	if req.ReadingID != nil {
		var err error
		reading, err = s.readingSvc.GetReading(*req.ReadingID)
		if err != nil {
			return empty, fmt.Errorf("could not find that reading")
		}
	}

	// ---------- Build the message list ----------
	var messages []client.AgentChatMessage

	for _, m := range req.History {
		messages = append(messages, client.AgentChatMessage{
			Role:       m.Role,
			Content:    m.Content,
			ToolCalls:  m.ToolCalls,
			ToolCallID: m.ToolCallID,
		})
	}

	// Add the farmer's new question.
	messages = append(messages, client.AgentChatMessage{
		Role:    "user",
		Content: req.Message,
	})

	var toolResults []client.AgentToolResult
	var toolsUsed []string
	var sources []model.ChatSource
	var researchSteps []model.ResearchStep

	// ---------- THE AGENT LOOP ----------
	//
	//   think  ->  act  ->  observe  ->  repeat
	//
	// WE drive it. The agent only DECIDES what should happen next.
	for round := 0; round < maxAgentRounds; round++ {

		// THINK: ask the agent what to do.
		resp, err := s.aiClient.Chat(client.AgentChatRequest{
			Messages:    messages,
			ToolResults: toolResults,
		})
		if err != nil {
			return empty, fmt.Errorf("the advisor is not available: %w", err)
		}

		// Keep the updated conversation for the next round.
		sources = append(sources, resp.Sources...)
		researchSteps = append(researchSteps, resp.ResearchSteps...)
		toolsUsed = append(toolsUsed, resp.ToolsUsed...)
		messages = resp.Messages
		toolResults = nil // clear, so we do not send them twice

		// DONE? The agent gave a final answer.
		if !resp.NeedsTools {
			answer := ""
			if resp.Answer != nil {
				answer = *resp.Answer
			}
			answer, sources = citedSources(answer, sources)

			return model.ChatResponse{
				Answer:        answer,
				History:       toModelMessages(messages),
				ToolsUsed:     toolsUsed,
				Sources:       sources,
				ResearchSteps: researchSteps,
			}, nil
		}

		// ACT: run every tool the agent asked for.
		for _, call := range resp.ToolCalls {
			content := s.runTool(call.Name, reading)

			toolResults = append(toolResults, client.AgentToolResult{
				ToolCallID: call.ID,
				Name:       call.Name,
				Content:    content,
			})

			toolsUsed = append(toolsUsed, call.Name)
		}

		// OBSERVE happens at the top of the next round, when we send
		// the results back.
	}

	// We hit the safety limit.
	return empty, fmt.Errorf(
		"the advisor took too many steps. Please ask a simpler question")
}

// runTool executes ONE tool and returns the result as TEXT.
//
// WHY TEXT and not JSON? Because the LLM reads text better than
// nested JSON. A clear sentence is easier for it to reason about.
//
// NOTE: every tool calls a service we ALREADY BUILT in Phase 6 and 7.
// Nothing new. The agent just uses what exists.
func (s *ChatService) runTool(name string, reading model.Reading) string {
	if reading.ReadingID == 0 && (name == "get_soil_history" || name == "get_fertilizer_advice" || name == "get_region_info") {
		return "No soil test is selected. Ask the farmer to submit a soil test for advice about their own field. You may still explain general information from reference sources."
	}

	switch name {

	// ---------- TOOL 1: soil history ----------
	case "get_soil_history":
		if reading.AnchorID == nil {
			return "No field is linked to this reading, so no history is available."
		}

		series, err := s.analyticsSvc.FieldHistory(*reading.AnchorID)
		if err != nil {
			return "Could not read the soil history right now."
		}

		if len(series.Points) == 0 {
			// IMPORTANT: say clearly that there is NO data.
			// If we returned an empty string, the model would
			// FILL THE GAP BY GUESSING.
			return "No soil readings found for this field yet."
		}

		var b strings.Builder
		b.WriteString(fmt.Sprintf(
			"Soil readings for this field (%d in total, oldest first):\n",
			series.TotalReadings))

		for _, p := range series.Points {
			b.WriteString(fmt.Sprintf(
				"  %s: nitrogen %.1f, phosphorus %.1f, potassium %.1f, pH %.2f\n",
				p.Date.Format("2006-01-02"), p.N, p.P, p.K, p.PH))
		}

		b.WriteString(fmt.Sprintf(
			"Current crop: %s, growth stage: %s, zone: %s.",
			reading.Crop, reading.Stage, reading.Zone))

		return b.String()

	// ---------- TOOL 2: fertilizer advice ----------
	case "get_fertilizer_advice":
		rec, err := s.readingSvc.GetRecommendation(reading.ReadingID)
		if err != nil {
			// This happens when the reading was FLAGGED in Phase 4.
			// Say so honestly, so the model does not invent an amount.
			return fmt.Sprintf(
				"No fertilizer recommendation is available. Reason: %s",
				err.Error())
		}

		return fmt.Sprintf(
			"Fertilizer recommendation for this %.2f hectare field of %s "+
				"at the %s stage:\n"+
				"  Urea: %.1f kg total (%.1f kg per hectare)\n"+
				"  DAP:  %.1f kg total (%.1f kg per hectare)\n"+
				"  MOP:  %.1f kg total (%.1f kg per hectare)\n"+
				"The soil still needs %.1f kg nitrogen, %.1f kg phosphorus "+
				"and %.1f kg potassium per hectare.",
			rec.AreaHa, rec.Crop, rec.Stage,
			rec.UreaTotal, rec.UreaPerHa,
			rec.DapTotal, rec.DapPerHa,
			rec.MopTotal, rec.MopPerHa,
			rec.NeedNPerHa, rec.NeedPPerHa, rec.NeedKPerHa)

	// ---------- TOOL 3: region info ----------
	case "get_region_info":
		result, err := s.analyticsSvc.Clusters()
		if err != nil {
			return "Regional soil grouping is not available yet. " +
				"More districts need soil readings first."
		}

		if reading.DistrictID == nil {
			return "This reading is not inside any known district."
		}

		// Which cluster is this farmer's district in?
		clusterID, found := result.Assignments[fmt.Sprintf("%d", *reading.DistrictID)]
		if !found {
			return "This district has not been grouped yet."
		}

		for _, c := range result.Clusters {
			if c.ClusterID == clusterID {
				return fmt.Sprintf(
					"This farmer's district belongs to a soil group described "+
						"as: %s. There are %d districts in this group: %s. "+
						"The group average is nitrogen %.1f, phosphorus %.1f, "+
						"potassium %.1f, pH %.2f.",
					c.Description, c.DistrictCount,
					strings.Join(c.DistrictNames, ", "),
					c.CentreN, c.CentreP, c.CentreK, c.CentrePH)
			}
		}

		return "Could not find the soil group for this district."

	// ---------- TOOL 4: weather ----------
	case "get_weather":
		// HONEST NOTE FOR YOUR REPORT:
		// This is a PLACEHOLDER. A real system would call a weather API
		// such as OpenWeatherMap or the Sri Lanka Department of
		// Meteorology. We return a clear "not available" message so the
		// model does NOT invent a forecast.
		return "Weather forecast data is not connected in this version. " +
			"Tell the farmer to check the local forecast before applying " +
			"fertilizer, because heavy rain washes nitrogen out of the soil."

	default:
		return "That tool is not available."
	}
}

// toModelMessages converts the client messages back to our model type.
func toModelMessages(messages []client.AgentChatMessage) []model.ChatMessage {
	var result []model.ChatMessage

	for _, m := range messages {
		result = append(result, model.ChatMessage{
			Role:       m.Role,
			Content:    m.Content,
			ToolCalls:  m.ToolCalls,
			ToolCallID: m.ToolCallID,
		})
	}

	return result
}
