from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    redis_url: str
    opa_url: str
    jwt_secret: str
    log_level: str = "INFO"
    environment: str = "development"

    class Config:
        env_file = "../.env"

settings = Settings()
