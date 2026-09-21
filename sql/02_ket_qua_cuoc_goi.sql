-- =====================================================================
-- Bước 2: lưu KẾT QUẢ cuộc gọi khi bấm "Đã gọi" (chạy 1 lần trong Supabase > SQL Editor)
-- Cần chạy SAU sql/reminders_schema.sql. An toàn khi chạy lại.
-- =====================================================================
alter table public.nhac_hen_lai
  add column if not exists ket_qua_goi            text,   -- kết quả người dùng chọn khi bấm "Đã gọi"
  add column if not exists ghi_chu_goi            text,   -- ghi chú của cuộc gọi đó
  add column if not exists ket_qua_call_history_id int4;  -- dòng call_history được tạo cho cuộc gọi này

-- Xem các "kết quả cuộc gọi" hệ thống ĐANG dùng (để so với danh sách trong services/reminderService.js):
--   select ket_qua_cuoc_goi, count(*) from public.call_history group by 1 order by 2 desc;
