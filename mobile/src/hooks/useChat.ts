import { useAppDispatch, useAppSelector } from "../store";
import { sendChatMessage, NoReadingError } from "../api/chatApi";
import {
  messageSent,
  answerReceived,
  noReading,
  chatFailed,
} from "../store/chatSlice";

export function useChat() {
  const dispatch = useAppDispatch();

  // The full history, to send back to the server.
  const history = useAppSelector((s) => s.chat.history);

  // Which field are we talking about?
  const lastReading = useAppSelector((s) => s.reading.result);

  async function send(text: string) {
    // Nothing typed.
    if (!text.trim()) {
      return;
    }

    // No soil reading yet. The tools would have nothing to look at.
    if (!lastReading) {
      dispatch(noReading(
        "Please submit a soil test first, so the advisor can see your field."
      ));
      return;
    }

    // Show the farmer's message IMMEDIATELY, before the server answers.
    // The app feels much faster this way.
    dispatch(messageSent(text.trim()));

    try {
      const result = await sendChatMessage({
        message: text.trim(),
        reading_id: lastReading.reading_id,
        history: history,   // the LLM has no memory, so we re-send it all
      });

      dispatch(answerReceived({
        answer: result.answer,
        history: result.history,
        toolsUsed: result.tools_used || [],
      }));

    } catch (e) {
      // No reading selected. A normal situation, not a crash.
      if (e instanceof NoReadingError) {
        dispatch(noReading(e.message));
        return;
      }

      const message =
        e instanceof Error
          ? e.message
          : "Could not reach the advisor. Check your connection.";

      dispatch(chatFailed(message));
    }
  }

  return { send };
}
