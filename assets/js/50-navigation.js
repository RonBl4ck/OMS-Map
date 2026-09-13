        // Tab view Navigation Controls
        const fullViewOverlay = document.getElementById("tdOmsModalOverlay");
        const llamadasOverlay = document.getElementById('llamadasModalOverlay');
        const btnCloseModal = document.getElementById("btnCloseModal");
        const btnCloseLlamadas = document.getElementById('btnCloseLlamadas');
        const tabTdOms = document.getElementById("tabTdOms");
        const tabTecnicos = document.getElementById('tabTecnicos');
        const tecnicosOverlay = document.getElementById('tecnicosModalOverlay');
        const tabLlamadas = document.getElementById('tabLlamadas');
        const tabMapaEl = document.getElementById("tabMapa");

        const primaryViews = [
            { tab: tabMapaEl, panel: document.getElementById('map'), name: 'map' },
            { tab: tabTdOms, panel: fullViewOverlay, name: 'indicators' },
            { tab: tabTecnicos, panel: tecnicosOverlay, name: 'tracking' },
            { tab: tabLlamadas, panel: llamadasOverlay, name: 'calls' }
        ];

        function selectPrimaryView(name) {
            primaryViews.forEach(view => {
                const selected = view.name === name;
                view.tab?.classList.toggle('active', selected);
                view.tab?.setAttribute('aria-selected', String(selected));
                if (view.name !== 'map') view.panel?.classList.toggle('active-view', selected);
            });
            document.body.dataset.primaryView = name;
            const mapSelected = name === 'map';
            [document.getElementById('map'), document.getElementById('mapSearchToolbar'), document.querySelector('.map-legend')].forEach(element => {
                if (!element) return;
                element.toggleAttribute('inert', !mapSelected);
                element.setAttribute('aria-hidden', String(!mapSelected));
            });
        }

        function showMapView() {
            selectPrimaryView('map');
            setTimeout(() => map?.invalidateSize?.(), 0);
        }

        function showDashboardView() {
            selectPrimaryView('indicators');
            refreshDashboard();
        }
        function showLlamadasView() {
            if (sessionStorage.getItem('oms_user_role') !== 'admin') return;
            selectPrimaryView('calls');
            loadLlamadas();
        }
        function showTecnicosView() {
            selectPrimaryView('tracking');
            loadTecnicos();
        }

        selectPrimaryView('map');


        if (tabTdOms) tabTdOms.addEventListener("click", showDashboardView);
        if (tabLlamadas) tabLlamadas.addEventListener('click', showLlamadasView);
        if (tabTecnicos) tabTecnicos.addEventListener('click', showTecnicosView);
        if (tabMapaEl) tabMapaEl.addEventListener("click", showMapView);
        if (btnCloseModal) btnCloseModal.addEventListener("click", showMapView);
        if (btnCloseLlamadas) btnCloseLlamadas.addEventListener('click', showMapView);
        const mobileActionsTrigger = document.getElementById('btnMobileActions');
        const mobileActionsMenu = document.getElementById('mobileActionsMenu');
        const closeMobileActions = () => {
            if (!mobileActionsTrigger || !mobileActionsMenu) return;
            mobileActionsTrigger.setAttribute('aria-expanded', 'false');
            mobileActionsMenu.hidden = true;
        };
        mobileActionsTrigger?.addEventListener('click', event => {
            event.stopPropagation();
            const willOpen = mobileActionsMenu?.hidden;
            if (!mobileActionsMenu) return;
            mobileActionsMenu.hidden = !willOpen;
            mobileActionsTrigger.setAttribute('aria-expanded', String(willOpen));
        });
        mobileActionsMenu?.addEventListener('click', closeMobileActions);
        document.addEventListener('click', event => {
            if (!event.target.closest?.('.mobile-actions')) closeMobileActions();
        });
        const llamadasFilterInput = document.getElementById('inputFilterLlamadas');
        const resetCallsAndRender = () => { callsRenderLimit = CALLS_PAGE_SIZE; renderLlamadasTable(); };
        if (llamadasFilterInput) llamadasFilterInput.addEventListener('input', debounceUi(resetCallsAndRender, 120));
        document.getElementById('callsLoadMore')?.addEventListener('click', () => { callsRenderLimit += CALLS_PAGE_SIZE; renderLlamadasTable(); });
        document.getElementById('btnClearCallsFilters')?.addEventListener('click', () => {
            if (llamadasFilterInput) llamadasFilterInput.value = '';
            callsRepeatCtrl?.reset();
            callsStatusCtrl?.reset();
            resetCallsAndRender();
        });
        document.getElementById('btnCloseCallDetail')?.addEventListener('click', closeCallDetail);
        document.getElementById('callDetailOverlay')?.addEventListener('click', event => {
            if (event.target.id === 'callDetailOverlay') closeCallDetail();
        });

        // Eventos del Modal Detalle de Técnico
        document.getElementById('btnCloseTechDetail')?.addEventListener('click', closeTechDetailModal);
        document.getElementById('techDetailModalOverlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'techDetailModalOverlay') closeTechDetailModal();
        });
        document.getElementById('inputFilterTechDetail')?.addEventListener('input', debounceUi(renderTechDetailTable, 100));
        document.getElementById('btnExportTechTickets')?.addEventListener('click', () => {
            if (!currentActiveTechTickets || !currentActiveTechTickets.length) {
                alert('No hay tickets disponibles para exportar.');
                return;
            }
            const techName = String(currentActiveTechRow?.['Tecnico visible'] || 'tecnico').replace(/[^a-zA-Z0-9]/g, '_');
            const fecha = String(currentActiveTechRow?.['día'] || 'fecha').replace(/[^a-zA-Z0-9]/g, '_');
            downloadExcel(currentActiveTechTickets, `tickets_${techName}_${fecha}`);
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                if (mobileActionsMenu && !mobileActionsMenu.hidden) {
                    closeMobileActions();
                    mobileActionsTrigger?.focus();
                    return;
                }
                const callDetail = document.getElementById('callDetailOverlay');
                const techModal = document.getElementById('techDetailModalOverlay');
                if (callDetail && callDetail.style.display !== 'none') {
                    closeCallDetail();
                } else if (techModal && techModal.style.display !== 'none') {
                    closeTechDetailModal();
                } else {
                    showMapView();
                }
            }
        });

        document.getElementById('inputFilterTecnicos')?.addEventListener('input', debounceUi(() => {
            renderTecnicos();
            renderTechGlobalSearchResults();
        }, 120));
        document.getElementById('inputFilterTecnicos')?.addEventListener('keydown', event => {
            if (event.key === 'Enter') document.querySelector('#techGlobalSearchResults .tech-search-result')?.click();
            if (event.key === 'Escape') document.getElementById('techGlobalSearchResults')?.classList.remove('show');
        });
        document.getElementById('btnResetTechFilters')?.addEventListener('click', () => {
            document.getElementById('inputFilterTecnicos').value = '';
            Object.values(techFilterControls).forEach(control => control?.reset());
            renderTecnicos();
        });
        document.getElementById('btnTechChartMode')?.addEventListener('click', toggleTechChartMode);
        document.getElementById('btnCloseTecnicos')?.addEventListener('click', showMapView);
