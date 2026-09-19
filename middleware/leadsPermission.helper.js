// middleware/leadsPermission.helper.js
// Logic kiểm tra quyền "xem_data_leads" dùng CHUNG cho:
// - middleware/checkLeadsAccess.js (chặn trang leads.html / calls.html)
// - middleware/requireLeadsApiAccess.js (chặn API /api/calls/*, /api/agent/leads...)
// Tách riêng để tránh viết trùng logic ở 2 nơi rồi sau này sửa 1 chỗ quên chỗ kia.

async function kiemTraQuyenLeads(supabase, tenDangNhap) {
    if (!tenDangNhap) {
        return { ok: false, reason: 'chua_dang_nhap' };
    }

    const { data: user, error } = await supabase
        .from('users')
        .select('trang_thai, xem_data_leads, phan_quyen')
        .eq('ten_dang_nhap', tenDangNhap)
        .single();

    if (error || !user) {
        return { ok: false, reason: 'khong_tim_thay' };
    }

    if (user.trang_thai === 'Tạm khoá') {
        return { ok: false, reason: 'bi_khoa' };
    }

    const duocPhep = user.phan_quyen === 'admin' || user.xem_data_leads === true;
    if (!duocPhep) {
        return { ok: false, reason: 'khong_co_quyen' };
    }

    return { ok: true, phan_quyen: user.phan_quyen };
}

module.exports = { kiemTraQuyenLeads };