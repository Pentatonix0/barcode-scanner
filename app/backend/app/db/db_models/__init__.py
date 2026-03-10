def load_models() -> None:
    from app.db.db_models.scan_session_model import ScanSession
    from app.db.db_models.scanned_item_model import ScannedItem
    from app.db.db_models.system_settings_model import SystemSetting
    from app.db.db_models.unknown_item_model import UnknownItem

    _ = (ScanSession, ScannedItem, SystemSetting, UnknownItem)


__all__ = ["load_models"]
