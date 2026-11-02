/**
 * OMS Store - Centralized Reactive State Store
 * Exposes omsStore and createStore with bidirectional global synchronization.
 * UMD / ES6 / Vanilla compatible.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.omsStore = api.omsStore;
        root.createStore = api.createStore;
        root.OmsStore = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
    const initialMap = () => new Map();
    const initialSet = () => new Set();

    function createDefaultState() {
        return {
            GOOGLE_SHEET_CSV_URL: "",
            GOOGLE_SHEET_EJECUTADOS_URL: "",
            GOOGLE_SHEET_LLAMADAS_URL: "",
            GOOGLE_SHEET_TECNICOS_URL: "",
            GOOGLE_SHEET_SED_CRITICAS_URL: "",
            GOOGLE_SHEET_SUPERVISOR_URL: "",
            supervisorRecordsMap: initialMap(),
            supervisorRecordsBySedMap: initialMap(),
            sedCriticasSet: initialSet(),
            sedCriticasMap: initialMap(),
            mapLocations: [],
            tdOmsRecords: [],
            rawData: [],
            llamadasRecords: [],
            llamadasLoaded: false,
            tecnicosRecords: [],
            tecnicosLoaded: false,
            techRefreshTimer: null,
            ejecutadosRecords: [],
            topCriticalSedsSet: initialSet(),
            topCriticalSedsList: [],
            leafletMap: null,
            markersGroup: null,
            markerMap: initialMap(),
            currentUserRole: null
        };
    }

    const SYNC_KEYS = [
        'GOOGLE_SHEET_CSV_URL',
        'GOOGLE_SHEET_EJECUTADOS_URL',
        'GOOGLE_SHEET_LLAMADAS_URL',
        'GOOGLE_SHEET_TECNICOS_URL',
        'GOOGLE_SHEET_SED_CRITICAS_URL',
        'GOOGLE_SHEET_SUPERVISOR_URL',
        'supervisorRecordsMap',
        'supervisorRecordsBySedMap',
        'sedCriticasSet',
        'sedCriticasMap',
        'mapLocations',
        'tdOmsRecords',
        'rawData',
        'llamadasRecords',
        'llamadasLoaded',
        'tecnicosRecords',
        'tecnicosLoaded',
        'techRefreshTimer',
        'ejecutadosRecords',
        'topCriticalSedsSet',
        'topCriticalSedsList',
        'leafletMap',
        'markersGroup',
        'markerMap'
    ];

    function createStore(initialState = {}) {
        let state = Object.assign(createDefaultState(), initialState);
        const listeners = new Set();
        let isNotifying = false;

        function getState() {
            return state;
        }

        function get(key) {
            return state[key];
        }

        function setState(updates) {
            const nextPartial = typeof updates === 'function' ? updates(state) : updates;
            if (!nextPartial || typeof nextPartial !== 'object') return state;

            const prevState = state;
            state = Object.assign({}, state, nextPartial);

            if (!isNotifying) {
                isNotifying = true;
                try {
                    listeners.forEach(listener => {
                        try {
                            listener(state, prevState);
                        } catch (err) {
                            console.error('[omsStore] listener error:', err);
                        }
                    });
                } finally {
                    isNotifying = false;
                }
            }

            return state;
        }

        function set(key, value) {
            return setState({ [key]: value });
        }

        function subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        }

        function reset(customState = {}) {
            const next = Object.assign(createDefaultState(), customState);
            return setState(next);
        }

        return {
            getState,
            get,
            set,
            setState,
            subscribe,
            reset
        };
    }

    const omsStore = createStore();

    function attachGlobalBindings(storeInstance, target) {
        if (!target) return;
        SYNC_KEYS.forEach(key => {
            try {
                const existingVal = target[key];
                if (existingVal !== undefined && existingVal !== null) {
                    const currentStoreVal = storeInstance.getState()[key];
                    const isStoreValDefaultEmpty = Array.isArray(currentStoreVal)
                        ? currentStoreVal.length === 0
                        : (currentStoreVal instanceof Map || currentStoreVal instanceof Set
                            ? currentStoreVal.size === 0
                            : !currentStoreVal);
                    if (isStoreValDefaultEmpty) {
                        storeInstance.setState({ [key]: existingVal });
                    }
                }

                Object.defineProperty(target, key, {
                    get() {
                        return storeInstance.getState()[key];
                    },
                    set(val) {
                        storeInstance.setState({ [key]: val });
                    },
                    configurable: true,
                    enumerable: true
                });
            } catch (e) {
                target[key] = storeInstance.getState()[key];
            }
        });
    }

    if (root) {
        attachGlobalBindings(omsStore, root);
        if (typeof window !== 'undefined' && window !== root) {
            attachGlobalBindings(omsStore, window);
        }
    }

    return {
        omsStore,
        createStore,
        attachGlobalBindings,
        createDefaultState
    };
}));
