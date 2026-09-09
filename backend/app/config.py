from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from typing import Set

INSECURE_SECRETS: Set[str] = {
    "super-secret-governance-key",
    "dummy",
    "development",
    "super-secret-key-for-dev",
    "secret",
    "changeme",
    "admin",
    "password",
    "123456",
}

class Settings(BaseSettings):
    database_url: str
    redis_url: str
    opa_url: str
    jwt_secret: str
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o"
    llm_mode: str = "REAL"  # REAL or DEMO
    openai_api_key: str = ""
    log_level: str = "INFO"
    environment: str = "development"
    agentguard_url: str = "http://localhost:8000"
    k8s_namespace: str = "agentguard"

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    @model_validator(mode="after")
    def validate_production_settings(self):
        env_lower = self.environment.lower()
        if env_lower in ["production", "staging"]:
            if not self.jwt_secret:
                raise ValueError(
                    f"Production startup failed: JWT secret is required in {self.environment} environment."
                )
            if self.jwt_secret.lower() in INSECURE_SECRETS or len(self.jwt_secret) < 32:
                raise ValueError(
                    f"Production startup failed: JWT secret is insecure or too short (<32 chars) for {self.environment} environment."
                )
            if self.llm_mode.upper() != "REAL":
                raise ValueError(
                    f"Production startup failed: LLM provider must be explicit REAL mode in {self.environment} environment."
                )
        return self

settings = Settings()

