"""
The tools the Advisory Agent can use.

IMPORTANT: this file is DATA, not logic. It only DESCRIBES the tools.
The tools are actually EXECUTED by the Go service.

WHY? Because Go owns the database. FastAPI only reasons.

THE DESCRIPTIONS MATTER MORE THAN YOU THINK.
The LLM chooses tools by READING these descriptions. A vague
description means wrong tool choices. Write each one as if
explaining to a new colleague who has never seen your system.
"""

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_soil_history",
            "description": (
                "Get the recent soil test readings for this farmer's field, "
                "showing how nitrogen, phosphorus, potassium and pH have "
                "changed over time. Use this whenever the farmer asks about "
                "their soil, their field, a trend, or what has changed."
            ),
            "parameters": {
                "type": "object",
                "properties": {},   # no arguments - Go knows the field
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_fertilizer_advice",
            "description": (
                "Get the exact fertilizer recommendation for this farmer's "
                "most recent soil reading: how many kilograms of urea, DAP "
                "and MOP to apply. Use this whenever the farmer asks what "
                "fertilizer to use, how much to apply, or what to buy."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_region_info",
            "description": (
                "Get information about the soil group this farmer's district "
                "belongs to, and which other districts have similar soil. "
                "Use this when the farmer asks whether their problem is "
                "common in the area, or about the region generally."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": (
                "Get the weather forecast for the farmer's location for the "
                "next few days. Use this when timing matters, for example "
                "before advising when to apply fertilizer, because heavy "
                "rain washes nitrogen out of the soil."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


# The names we accept. Used to check the LLM did not invent a tool.
VALID_TOOL_NAMES = {
    "get_soil_history",
    "get_fertilizer_advice",
    "get_region_info",
    "get_weather",
}
