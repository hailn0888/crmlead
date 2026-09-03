/**
 * ====================================================================================
 * HỆ THỐNG QUẢN LÝ THEME TRUNG TÂM (THEME.JS)
 * ====================================================================================
 */

const THEME_CONFIG = {
    // 1. GIAO DIỆN SÁNG (Light Mode)
    light: {
        name: 'light',
        bgPage: '#ffffff',
        bgCard: '#f8fafc',
        border: '#e2e8f0',
        textMain: '#0f172a',
        textMuted: '#64748b',
        
        headerBg: '#ed1b24', // Đỏ Prudential
        headerText: '#ffffff',

        // Khung Quản trị viên hệ thống (Dropdown)
        dropdownBg: '#ffffff',
        dropdownBorder: '#cbd5e1',
        dropdownHover: '#f1f5f9',

        // Sidebar cho Theme Sáng
        sidebarBg: '#f8fafc',
        sidebarBorder: '#e2e8f0',
        sidebarText: '#334155',
        sidebarHover: '#f1f5f9',

        btn: {
            defaultBg: '#ffffff',
            defaultText: '#334155',
            defaultBorder: '#cbd5e1',
            defaultHover: '#f1f5f9',
            primaryBg: '#10b981',
            primaryText: '#ffffff',
            primaryHover: '#059669',
            dangerBg: '#fee2e2',
            dangerText: '#991b1b',
            dangerBorder: '#fca5a5'
        }
    },

    // 2. GIAO DIỆN TỐI (Dark Mode)
    dark: {
        name: 'dark',
        bgPage: '#121212',
        bgCard: '#1a1a1a',
        border: '#2a2a2a',
        textMain: '#f8fafc',
        textMuted: '#94a3b8',

        headerBg: '#18181b',
        headerText: '#f8fafc',

        // Khung Quản trị viên hệ thống (Dropdown)
        dropdownBg: '#1f1f1f',
        dropdownBorder: '#2f2f2f',
        dropdownHover: '#2a2a2a',

        // Sidebar cho Theme Tối
        sidebarBg: '#181818',
        sidebarBorder: '#2a2a2a',
        sidebarText: '#a1a1a1',
        sidebarHover: '#252525',

        btn: {
            defaultBg: '#1f2937',
            defaultText: '#e5e7eb',
            defaultBorder: '#374151',
            defaultHover: '#374151',
            primaryBg: '#059669',
            primaryText: '#ffffff',
            primaryHover: '#047857',
            dangerBg: '#451a03',
            dangerText: '#fca5a5',
            dangerBorder: '#78350f'
        }
    }
};

function applyTheme(themeName) {
    const config = THEME_CONFIG[themeName] || THEME_CONFIG.light;
    const root = document.documentElement;

    if (themeName === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }

    localStorage.setItem('crm_theme', themeName);

    // Gán biến CSS động
    root.style.setProperty('--bg-page', config.bgPage);
    root.style.setProperty('--bg-card', config.bgCard);
    root.style.setProperty('--border-color', config.border);
    root.style.setProperty('--text-main', config.textMain);
    root.style.setProperty('--text-muted', config.textMuted);

    root.style.setProperty('--header-bg', config.headerBg);
    root.style.setProperty('--header-text', config.headerText);

    root.style.setProperty('--dropdown-bg', config.dropdownBg);
    root.style.setProperty('--dropdown-border', config.dropdownBorder);
    root.style.setProperty('--dropdown-hover', config.dropdownHover);

    // Biến CSS cho Sidebar
    root.style.setProperty('--sidebar-bg', config.sidebarBg);
    root.style.setProperty('--sidebar-border', config.sidebarBorder);
    root.style.setProperty('--sidebar-text', config.sidebarText);
    root.style.setProperty('--sidebar-hover', config.sidebarHover);

    root.style.setProperty('--btn-bg', config.btn.defaultBg);
    root.style.setProperty('--btn-text', config.btn.defaultText);
    root.style.setProperty('--btn-border', config.btn.defaultBorder);
    root.style.setProperty('--btn-hover', config.btn.defaultHover);
    root.style.setProperty('--btn-primary-bg', config.btn.primaryBg);
    root.style.setProperty('--btn-primary-text', config.btn.primaryText);
    root.style.setProperty('--btn-primary-hover', config.btn.primaryHover);
    root.style.setProperty('--btn-danger-bg', config.btn.dangerBg);
    root.style.setProperty('--btn-danger-text', config.btn.dangerText);
    root.style.setProperty('--btn-danger-border', config.btn.dangerBorder);

    updateGlobalStyles(config);
}

function updateGlobalStyles(config) {
    let styleTag = document.getElementById('dynamic-theme-styles');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-theme-styles';
        document.head.appendChild(styleTag);
    }

    styleTag.innerHTML = `
        body {
            background-color: var(--bg-page) !important;
            color: var(--text-main) !important;
            transition: background-color 0.2s ease, color 0.2s ease;
        }
        
        header, .app-header {
            background-color: var(--header-bg) !important;
            color: var(--header-text) !important;
        }

        /* Sidebar bám màu từ theme.js */
        aside, .app-sidebar {
            background-color: var(--sidebar-bg) !important;
            border-color: var(--sidebar-border) !important;
            color: var(--sidebar-text) !important;
        }

        .theme-card {
            background-color: var(--bg-card) !important;
            border-color: var(--border-color) !important;
        }

        .theme-dropdown {
            background-color: var(--dropdown-bg) !important;
            border-color: var(--dropdown-border) !important;
            color: var(--text-main) !important;
        }
        .theme-dropdown-item:hover {
            background-color: var(--dropdown-hover) !important;
        }

        /* --- BỔ SUNG ĐỂ ĐỒNG BỘ TOÀN BỘ CARD, BẢNG, INPUT THEO THEME --- */
        .file-card {
            background-color: var(--bg-card) !important;
            border-color: var(--border-color) !important;
            color: var(--text-main) !important;
        }
        .file-card:hover {
            border-color: var(--border-color) !important;
        }

        /* Bảng dữ liệu và các hàng trong bảng */
        table, th, td {
            border-color: var(--border-color) !important;
            color: var(--text-main) !important;
        }
        tr:hover {
            background-color: var(--dropdown-hover) !important;
        }

        /* Ô nhập liệu (input, select, textarea) bám theo theme */
        input, select, textarea {
            background-color: var(--bg-card) !important;
            color: var(--text-main) !important;
            border-color: var(--border-color) !important;
        }
        input:focus, select:focus, textarea:focus {
            border-color: #10b981 !important;
            outline: none;
        }
        /* ------------------------------------------------------------- */

        .btn-theme {
            background-color: var(--btn-bg);
            color: var(--btn-text);
            border: 1px solid var(--btn-border);
            padding: 0.375rem 0.75rem;
            border-radius: 0.375rem;
            font-size: 0.875rem;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.15s ease-in-out;
            cursor: pointer;
        }
        .btn-theme:hover {
            background-color: var(--btn-hover);
        }

        .btn-theme-primary {
            background-color: var(--btn-primary-bg);
            color: var(--btn-primary-text);
            border: 1px solid transparent;
            padding: 0.375rem 0.875rem;
            border-radius: 0.375rem;
            font-size: 0.875rem;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.15s ease-in-out;
            cursor: pointer;
        }
        .btn-theme-primary:hover {
            background-color: var(--btn-primary-hover);
        }

        .btn-theme-danger {
            background-color: var(--btn-danger-bg);
            color: var(--btn-danger-text);
            border: 1px solid var(--btn-danger-border);
            padding: 0.375rem 0.75rem;
            border-radius: 0.375rem;
            font-size: 0.875rem;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }
    `;
}

function toggleTheme() {
    const current = localStorage.getItem('crm_theme') || 'light';
    const nextTheme = current === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
}

// Chạy ngay khi tải file để tránh chớp màn hình trắng/đen
(function () {
    const savedTheme = localStorage.getItem('crm_theme') || 'dark';
    applyTheme(savedTheme);
})();

// Chạy ngay khi tải file: Ưu tiên lấy theme đã lưu trong localStorage, nếu chưa có thì mặc định là 'light'
(function () {
    const savedTheme = localStorage.getItem('crm_theme') || 'light';
    applyTheme(savedTheme);
})();