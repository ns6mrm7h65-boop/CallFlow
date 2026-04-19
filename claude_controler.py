import os

import anthropic
from dotenv import load_dotenv

load_dotenv()


class ClaudeController:
    def __init__(self) -> None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY lipsește din .env")

        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = "claude-haiku-4-5-20251001"
