"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useApi = useApi;
const react_1 = require("react");
function useApi(apiFunc) {
    const [state, setState] = (0, react_1.useState)({
        data: null,
        loading: false,
        error: null,
    });
    const execute = (0, react_1.useCallback)(async (...args) => {
        setState({ data: null, loading: true, error: null });
        try {
            const result = await apiFunc(...args);
            setState({ data: result, loading: false, error: null });
            return result;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'An unexpected error occurred';
            setState({ data: null, loading: false, error: message });
            return undefined;
        }
    }, [apiFunc]);
    const reset = (0, react_1.useCallback)(() => {
        setState({ data: null, loading: false, error: null });
    }, []);
    return { ...state, execute, reset };
}
//# sourceMappingURL=useApi.js.map