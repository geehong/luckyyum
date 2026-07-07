from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str = "redis://luckyyum_redis:6379/0"
    GOOGLE_OAUTH_KEY: str = ""
    AUTH_SECRET_KEY: str = "luckyyum_auth_secret_key_change_me_in_prod_12345"

    # .env 파일을 읽어오며, 정의되지 않은 변수는 무시합니다.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()