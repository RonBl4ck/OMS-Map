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

        function showMapView() {
            if (fullViewOverlay) fullViewOverlay.classList.remove("active-view");
            if (llamadasOverlay) llamadasOverlay.classList.remove('active-view');
            if (tecnicosOverlay) tecnicosOverlay.classList.remove('active-view');
            if (tabMapaEl) tabMapaEl.classList.add("active");
            if (tabTdOms) tabTdOms.classList.remove("active");
            if (tabLlamadas) tabLlamadas.classList.remove('active');
            if (tabTecnicos) tabTecnicos.classList.remove('active');
        }

        function showDashboardView() {
            if (fullViewOverlay) fullViewOverlay.classList.add("active-view");
            if (llamadasOverlay) llamadasOverlay.classList.remove('active-view');
            if (tabTdOms) tabTdOms.classList.add("active");
            if (tabMapaEl) tabMapaEl.classList.remove("active");
            if (tabLlamadas) tabLlamadas.classList.remove('active');
            refreshDashboard();
        }
        function showLlamadasView() {
            if (sessionStorage.getItem('oms_user_role') !== 'admin') return;
            if (fullViewOverlay) fullViewOverlay.classList.remove('active-view');
            if (llamadasOverlay) llamadasOverlay.classList.add('active-view');
            if (tabLlamadas) tabLlamadas.classList.add('active');
            if (tabMapaEl) tabMapaEl.classList.remove('active');
            if (tabTdOms) tabTdOms.classList.remove('active');
            loadLlamadas();
        }
        function showTecnicosView() {
            if (fullViewOverlay) fullViewOverlay.classList.remove('active-view');
            if (llamadasOverlay) llamadasOverlay.classList.remove('active-view');
            if (tecnicosOverlay) tecnicosOverlay.classList.add('active-view');
            if (tabTecnicos) tabTecnicos.classList.add('active');
            if (tabMapaEl) tabMapaEl.classList.remove('active');
            if (tabTdOms) tabTdOms.classList.remove('active');
            if (tabLlamadas) tabLlamadas.classList.remove('active');
            loadTecnicos();
        }


        if (tabTdOms) tabTdOms.addEventListener("click", showDashboardView);
        if (tabLlamadas) tabLlamadas.addEventListener('click', showLlamadasView);
        if (tabTecnicos) tabTecnicos.addEventListener('click', showTecnicosView);
        if (tabMapaEl) tabMapaEl.addEventListener("click", showMapView);
        if (btnCloseModal) btnCloseModal.addEventListener("click", showMapView);
        if (btnCloseLlamadas) btnCloseLlamadas.addEventListener('click', showMapView);
        const llamadasFilterInput = document.getElementById('inputFilterLlamadas');
        if (llamadasFilterInput) llamadasFilterInput.addEventListener('input', renderLlamadasTable);

        // Eventos del Modal Detalle de Técnico
        document.getElementById('btnCloseTechDetail')?.addEventListener('click', closeTechDetailModal);
        document.getElementById('techDetailModalOverlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'techDetailModalOverlay') closeTechDetailModal();
        });
        document.getElementById('inputFilterTechDetail')?.addEventListener('input', renderTechDetailTable);
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
                const techModal = document.getElementById('techDetailModalOverlay');
                if (techModal && techModal.style.display !== 'none') {
                    closeTechDetailModal();
                } else {
                    showMapView();
                }
            }
        });

        document.getElementById('inputFilterTecnicos')?.addEventListener('input', renderTecnicos);
        ['techDate','techCompany','techName','techSkill','techZone','techState'].forEach(id => document.getElementById(id)?.addEventListener('change', () => { refreshTechFilterOptions(); renderTecnicos(); }));
        document.getElementById('btnResetTechFilters')?.addEventListener('click', () => {
            document.getElementById('inputFilterTecnicos').value = '';
            ['techCompany','techName','techSkill','techZone','techState'].forEach(id => { document.getElementById(id).value = ''; });
            initializeTechFilters();
            renderTecnicos();
        });
        document.getElementById('btnCloseTecnicos')?.addEventListener('click', showMapView);
