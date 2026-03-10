import { useEffect, useState } from 'react';

import { translate } from '../i18n';
import { fetchJson } from '../utils/http';
import type {
    CatalogItem,
    SessionHistoryDetails,
    SessionHistoryList,
} from '../types';

export function useSessionHistory(apiUrl: string) {
    const [sessions, setSessions] = useState<SessionHistoryList['sessions']>(
        [],
    );
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [details, setDetails] = useState<
        Record<number, SessionHistoryDetails>
    >({});
    const [loadingSessionId, setLoadingSessionId] = useState<number | null>(
        null,
    );
    const [detailError, setDetailError] = useState<string | null>(null);
    const [productDetails, setProductDetails] = useState<Record<string, CatalogItem>>(
        {},
    );
    const [productErrors, setProductErrors] = useState<Record<string, string>>({});
    const [loadingProductBarcode, setLoadingProductBarcode] = useState<
        string | null
    >(null);

    const refresh = async (limit = 50, offset = 0) => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchJson<SessionHistoryList>(
                `${apiUrl}/sessions?limit=${limit}&offset=${offset}`,
            );
            setSessions(data.sessions ?? []);
            setTotal(data.total ?? 0);
            return data;
        } catch (err) {
            setError(
                err instanceof Error ? err.message : translate('error.historyLoad'),
            );
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const loadDetails = async (sessionId: number, force = false) => {
        if (!force && details[sessionId]) {
            return details[sessionId];
        }
        setLoadingSessionId(sessionId);
        setDetailError(null);
        try {
            const data = await fetchJson<SessionHistoryDetails>(
                `${apiUrl}/sessions/${sessionId}`,
            );
            setDetails((prev) => ({ ...prev, [sessionId]: data }));
            return data;
        } catch (err) {
            setDetailError(
                err instanceof Error
                    ? err.message
                    : translate('error.historyDetails'),
            );
            throw err;
        } finally {
            setLoadingSessionId(null);
        }
    };

    const loadProductByBarcode = async (barcode: string, force = false) => {
        if (!force && productDetails[barcode]) {
            return productDetails[barcode];
        }

        setLoadingProductBarcode(barcode);
        setProductErrors((prev) => {
            const next = { ...prev };
            delete next[barcode];
            return next;
        });

        try {
            const data = await fetchJson<CatalogItem>(
                `${apiUrl}/catalog/item/${encodeURIComponent(barcode)}`,
            );
            setProductDetails((prev) => ({ ...prev, [barcode]: data }));
            return data;
        } catch (err) {
            const message =
                err instanceof Error ? err.message : translate('error.productLoad');
            setProductErrors((prev) => ({ ...prev, [barcode]: message }));
            throw err;
        } finally {
            setLoadingProductBarcode((prev) => (prev === barcode ? null : prev));
        }
    };

    useEffect(() => {
        setDetails({});
        setProductDetails({});
        setProductErrors({});
        refresh().catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiUrl]);

    return {
        sessions,
        total,
        loading,
        error,
        refresh,
        details,
        loadDetails,
        loadingSessionId,
        detailError,
        productDetails,
        productErrors,
        loadingProductBarcode,
        loadProductByBarcode,
    };
}
