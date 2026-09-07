// public/agents/js/supabaseClient.js
const SUPABASE_URL = 'https://iiwwqwsmxdzrmqrsbddq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpd3dxd3NteGR6cm1xcnNiZGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMTY4NTYsImV4cCI6MjEwMzU5Mjg1Nn0.jUMJGZL9hVII2FXnfYgDMhFMDRMRM40U4UhVMTj7Ri4';

// Khởi tạo Supabase Client gắn vào window để dùng toàn trang
if (typeof supabase !== 'undefined') {
  window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error("Lỗi: Chưa nạp thư viện Supabase CDN trước file supabaseClient.js!");
}