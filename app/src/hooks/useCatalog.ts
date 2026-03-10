import { useEffect, useState } from "react";

import { translate } from "../i18n";
import { fetchBlob, fetchJson } from "../utils/http";
import type { CatalogMeta } from "../types";

export function useCatalog(apiUrl: string) {
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<CatalogMeta>(`${apiUrl}/catalog/meta`);
      setMeta(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : translate("error.catalogLoad");
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await fetchJson<CatalogMeta>(`${apiUrl}/catalog/upload`, {
        method: "POST",
        body: form,
      });
      setMeta(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : translate("error.catalogUpload");
      setError(message);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      const data = await fetchJson<CatalogMeta>(`${apiUrl}/catalog/delete`, {
        method: "DELETE",
      });
      setMeta(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : translate("error.catalogDelete");
      setError(message);
      throw err;
    } finally {
      setDeleting(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const { blob, filename } = await fetchBlob(`${apiUrl}/catalog/download`);
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fallbackName =
        (meta?.file ? meta.file.split(/[\\/]/).pop() : null) || "catalog.xlsx";
      link.href = objectUrl;
      link.download = filename || fallbackName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : translate("error.catalogDownload");
      setError(message);
      throw err;
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    setMeta(null);
    refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  return {
    meta,
    loading,
    uploading,
    deleting,
    downloading,
    error,
    refresh,
    upload,
    remove,
    download,
    setMeta,
  };
}
