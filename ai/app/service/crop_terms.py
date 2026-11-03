"""Literal crop identities used to prevent cross-crop retrieval mistakes."""
import re

ALIASES = {
    "mung": ["mung", "mungbean", "mung bean", "green gram", "මුං"],
    "cowpea": ["cowpea", "කව්පි"],
    "onion": ["onion", "ලූනු", "රතුලූනු", "රතු ලූනු", "බී ලූනු"],
    "maize": ["maize", "corn", "බඩඉරිඟු", "බඩ ඉරිඟු"],
    "rice": ["rice", "paddy", "වී"],
    "tea": ["tea", "තේ"],
    "coconut": ["coconut", "පොල්"],
    "banana": ["banana", "කෙසෙල්"],
    "tomato": ["tomato", "තක්කාලි"],
    "potato": ["potato", "අර්තාපල්"],
    "cabbage": ["cabbage", "ගෝවා"],
    "chilli": ["chilli", "chili", "මිරිස්"],
}


def crops_in(text):
    text = text.casefold()
    return {crop for crop, aliases in ALIASES.items() if any(
        re.search(r"(?<![\w\u0d80-\u0dff])" + re.escape(alias) + r"(?![\w\u0d80-\u0dff])", text)
        for alias in aliases
    )}
