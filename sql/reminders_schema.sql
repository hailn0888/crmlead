-- =====================================================================
-- NHẮC LỊCH CHĂM SÓC KHÁCH HÀNG - MIGRATION (chạy 1 lần trong Supabase > SQL Editor)
-- An toàn khi chạy lại (dùng IF NOT EXISTS).
-- =====================================================================

-- 1) Mở rộng bảng nhac_hen_lai --------------------------------------------
alter table public.nhac_hen_lai
  add column if not exists user_id              int4,                    -- người nhận nhắc (users.id)
  add column if not exists call_history_id      int4,                    -- cuộc gọi gốc sinh ra nhắc hẹn
  add column if not exists trang_thai           text        not null default 'cho',  -- cho | da_goi | huy
  add column if not exists nhac_truoc_phut      int         not null default 15,
  add column if not exists da_nhac_truoc_luc    timestamptz,             -- mốc "sắp tới giờ" đã gửi
  add column if not exists da_nhac_dung_gio_luc timestamptz,             -- mốc "đúng giờ" đã gửi
  add column if not exists da_nhac_qua_han_luc  timestamptz,             -- mốc "quá hạn" đã gửi
  add column if not exists da_goi_luc           timestamptz,
  add column if not exists so_lan_hoan          int         not null default 0,
  add column if not exists updated_at           timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nhac_hen_lai_trang_thai_chk') then
    alter table public.nhac_hen_lai
      add constraint nhac_hen_lai_trang_thai_chk check (trang_thai in ('cho','da_goi','huy'));
  end if;
end $$;

-- Gắn user_id cho các nhắc hẹn cũ (khớp theo họ tên hoặc tên đăng nhập)
update public.nhac_hen_lai n
   set user_id = u.id
  from public.users u
 where n.user_id is null
   and (u.ho_va_ten = n.ten_agent or u.ten_dang_nhap = n.ten_agent);

-- Nhắc hẹn cũ đã quá giờ: đánh dấu "đã xử lý mốc" để KHÔNG bắn thông báo ào ạt
-- lần đầu job chạy. Chúng vẫn hiện ở Tab 4 với nhãn "Quá hạn".
update public.nhac_hen_lai
   set da_nhac_truoc_luc    = coalesce(da_nhac_truoc_luc, now()),
       da_nhac_dung_gio_luc = coalesce(da_nhac_dung_gio_luc, now()),
       da_nhac_qua_han_luc  = coalesce(da_nhac_qua_han_luc, now())
 where trang_thai = 'cho' and thoi_gian_nhac < now();

create index if not exists nhac_hen_lai_cho_idx
  on public.nhac_hen_lai (thoi_gian_nhac) where trang_thai = 'cho';
create index if not exists nhac_hen_lai_agent_idx
  on public.nhac_hen_lai (ten_agent);

-- 2) Thiết bị nhận Web Push (PC + mobile) ----------------------------------
create table if not exists public.push_subscriptions (
  id          bigserial primary key,
  user_id     int4 not null references public.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  thiet_bi    text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- BẢO MẬT: bảng này chứa khóa của thiết bị nên KHÔNG được mở cho anon key
-- (supabaseClient.js phía trình duyệt dùng anon key). Bật RLS và không tạo policy nào:
-- chỉ server dùng service_role key mới đọc/ghi được.
-- Nếu server của bạn đang dùng anon key thì đổi sang service_role key ở .env của server.
alter table public.push_subscriptions enable row level security;
