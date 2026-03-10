from app.core.core_utils.init_server import get_email_notification_service
from app.dto.notification_dto.request_dto import EmailSettingsUpsertDto
from app.dto.notification_dto.response_dto import EmailSettingsDto, EmailTestResultDto
from app.services.notification_service.email_notification_service import (
    EmailNotificationService,
)
from fastapi import APIRouter, Depends, HTTPException

notification_router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
    responses={200: {"description": "Success"}, 400: {"description": "Bad request"}},
)


@notification_router.get(
    "/email/settings",
    summary="Get email notification settings",
    response_model=EmailSettingsDto,
)
async def get_email_settings(
    service: EmailNotificationService = Depends(get_email_notification_service),
) -> EmailSettingsDto:
    data = await service.get_settings()
    return EmailSettingsDto(**data)


@notification_router.put(
    "/email/settings",
    summary="Save email notification settings and validate SMTP connection",
    response_model=EmailSettingsDto,
)
async def put_email_settings(
    payload: EmailSettingsUpsertDto,
    service: EmailNotificationService = Depends(get_email_notification_service),
) -> EmailSettingsDto:
    try:
        data = await service.save_settings(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"SMTP validation failed: {exc}"
        ) from exc
    return EmailSettingsDto(**data)


@notification_router.post(
    "/email/test",
    summary="Validate SMTP connection with current or provided settings",
    response_model=EmailTestResultDto,
)
async def test_email_settings(
    payload: EmailSettingsUpsertDto,
    service: EmailNotificationService = Depends(get_email_notification_service),
) -> EmailTestResultDto:
    try:
        ok, detail = await service.test_settings(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"SMTP connection failed: {exc}"
        ) from exc
    return EmailTestResultDto(ok=ok, detail=detail)
