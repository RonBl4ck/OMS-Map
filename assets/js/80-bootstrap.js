        document.addEventListener("DOMContentLoaded", () => {
            const btnToggleMobile = document.getElementById("btnToggleMobileFilterBar");
            const wrapperFilter = document.getElementById("mapFilterContentWrapper");
            const iconFilter = document.getElementById("mobileFilterIcon");
            if (btnToggleMobile && wrapperFilter) {
                btnToggleMobile.addEventListener("click", () => {
                    const isCollapsed = wrapperFilter.classList.toggle("collapsed-mobile");
                    if (iconFilter) iconFilter.textContent = isCollapsed ? "▲" : "▼";
                });
            }
            initConfigSecurity();
            checkAuthentication();
        });
