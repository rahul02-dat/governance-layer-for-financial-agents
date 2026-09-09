from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    redis_url: str
    opa_url: str
    jwt_secret: str
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o"
    openai_api_key: str = ""
    log_level: str = "INFO"
    environment: str = "development"

    class Config:
        env_file = "../.env"

settings = Settings()
