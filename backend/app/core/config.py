import json
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    vivo_app_id: str = ""
    vivo_app_key: str = ""
    vivo_api_base_url: str = "https://api-ai.vivo.com.cn/v1"
    vivo_model_name: str = "Doubao-Seed-2.0-mini"
    vivo_vision_model_name: str = "Doubao-Seed-2.0-mini"
    vivo_ocr_api_url: str = ""
    vivo_ocr_mode: str = "auto"
    vivo_ocr_pos: int = 2
    vivo_use_mock: bool = True
    vivo_use_proxy: bool = False
    vivo_timeout_seconds: float = 120
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://192.168.233.1:5173",
        "http://192.168.48.1:5173",
        "http://10.142.123.107:5173",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return []
            if value.startswith("["):
                return json.loads(value)
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), env_file_encoding="utf-8")


settings = Settings()
