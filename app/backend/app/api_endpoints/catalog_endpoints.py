import shutil
from pathlib import Path

from app.core.config.init_app_config import app_config
from app.core.core_utils.init_server import get_repository, get_ws_manager
from app.dto.catalog_dto.response_dto import CatalogItemDto, CatalogMetaDto
from app.infrastructure.ws_manager import WebSocketManager
from app.repositories.excel_repository import ExcelProductRepository
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

catalog_router = APIRouter(
    prefix="/catalog",
    tags=["catalog"],
    responses={
        200: {"description": "Success"},
        400: {"description": "Bad request"},
    },
)


@catalog_router.post(
    "/upload",
    summary="Upload catalog file",
    description="Uploads a .xlsx catalog file and reloads the in-memory index.",
    response_model=CatalogMetaDto,
)
async def upload_catalog(
    file: UploadFile = File(...),
    repo: ExcelProductRepository = Depends(get_repository),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
) -> CatalogMetaDto:
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")

    catalog_path = Path(app_config.catalog.catalog_path).expanduser()
    temp_path = Path(str(catalog_path) + ".tmp")

    with temp_path.open("wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            buffer.write(chunk)

    shutil.move(str(temp_path), str(catalog_path))

    try:
        await repo.reload()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    meta = repo.meta()
    await ws_manager.broadcast({"type": "catalog_loaded", "meta": meta})
    return CatalogMetaDto(**meta)


@catalog_router.get(
    "/meta",
    summary="Catalog metadata",
    description="Returns current catalog metadata.",
    response_model=CatalogMetaDto,
)
async def catalog_meta(
    repo: ExcelProductRepository = Depends(get_repository),
) -> CatalogMetaDto:
    return CatalogMetaDto(**repo.meta())


@catalog_router.get(
    "/item/{barcode}",
    summary="Catalog product by barcode",
    description="Returns product fields from current catalog by barcode.",
    response_model=CatalogItemDto,
)
async def catalog_item(
    barcode: str,
    repo: ExcelProductRepository = Depends(get_repository),
) -> CatalogItemDto:
    product = await repo.get_by_barcode(barcode)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return CatalogItemDto(barcode=product.barcode, fields=product.fields)


@catalog_router.get(
    "/download",
    summary="Download current catalog file",
    description="Returns uploaded catalog .xlsx file.",
)
async def download_catalog() -> FileResponse:
    catalog_path = Path(app_config.catalog.catalog_path).expanduser()
    if not catalog_path.exists() or not catalog_path.is_file():
        raise HTTPException(status_code=404, detail="Catalog file not found")

    return FileResponse(
        path=str(catalog_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=catalog_path.name,
    )


@catalog_router.delete(
    "/delete",
    summary="Delete catalog file",
    description="Deletes uploaded catalog file and clears in-memory index.",
    response_model=CatalogMetaDto,
)
async def delete_catalog(
    repo: ExcelProductRepository = Depends(get_repository),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
) -> CatalogMetaDto:
    catalog_path = Path(app_config.catalog.catalog_path).expanduser()
    if catalog_path.exists():
        try:
            catalog_path.unlink()
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete catalog file: {exc}",
            ) from exc

    try:
        await repo.reload()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    meta = repo.meta()
    await ws_manager.broadcast({"type": "catalog_cleared", "meta": meta})
    return CatalogMetaDto(**meta)
