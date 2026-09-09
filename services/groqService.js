/*
  Tên file: services/groqService.js
  Chức năng: Gọi Groq API (https://console.groq.com) - AI MIỄN PHÍ, không cần thẻ tín dụng.
  Đây là nơi DUY NHẤT trong toàn hệ thống chứa GROQ_API_KEY (đọc từ biến môi trường),
  mọi tính năng AI khác (Tab AI Insights ở calls.html, phân tích Lead ở leads.html...)
  đều nên gọi qua các hàm export ở file này, KHÔNG gọi thẳng Groq ở nơi khác.

  CÁCH LẤY API KEY MIỄN PHÍ:
  1. Vào https://console.groq.com -> Đăng nhập (Google/GitHub, không cần thẻ)
  2. Vào mục "API Keys" -> "Create API Key" -> đặt tên bất kỳ -> Copy key (dạng gsk_...)
  3. Thêm vào file .env của server (KHÔNG commit .env lên git):
       GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx
       GROQ_MODEL=llama-3.3-70b-versatile
  4. Đảm bảo server.js có require('dotenv').config() ở đầu file để đọc được .env

  Vì sao chọn Groq thay vì Google Gemini free tier: Groq hoàn toàn miễn phí, không cần
  thẻ, quota rộng rãi, và không có báo cáo bị chặn 403 khi gọi từ IP datacenter (Render.com...)
  như Gemini free tier hiện đang gặp phải.
*/

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
// LƯU Ý: llama-3.3-70b-versatile đã bị Groq NGỪNG HỖ TRỢ từ 16/08/2026.
// openai/gpt-oss-120b là model được Groq khuyến nghị thay thế trực tiếp, vẫn miễn phí.
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

async function callGroq({ prompt, temperature = 0.4, maxTokens = 600, jsonMode = false }) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('Thiếu biến môi trường GROQ_API_KEY. Xem hướng dẫn ở đầu file services/groqService.js');
    }
    const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

    const body = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens
    };
    if (jsonMode) body.response_format = { type: 'json_object' };

    // Các model "gpt-oss" là model reasoning: tự suy luận ngầm trước khi trả lời, tốn
    // kha khá token cho phần suy luận đó. Nếu không giới hạn lại, model có thể dùng hết
    // max_tokens để "suy nghĩ" mà chưa kịp xuất câu trả lời -> lỗi json_validate_failed.
    // "low" giảm token suy luận ngầm, dành chỗ cho phần trả lời thật sự.
    if (model.includes('gpt-oss')) {
        body.reasoning_effort = 'low';
    }

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq API trả lỗi (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('Groq không trả về nội dung.');
    return content;
}

/**
 * [Dùng cho Tab AI Insights ở calls.html] Phân tích lịch sử ghi chú chăm sóc khách hàng
 * và trả về đánh giá + lời khuyên.
 * @param {string} customerName
 * @param {Array<{lan_goi:number, thoi_gian_goi:string, noi_dung:string}>} ghiChuList
 * @returns {Promise<string>}
 */
async function generateAiInsight(customerName, ghiChuList) {
    const lichSuGoi = (ghiChuList && ghiChuList.length > 0)
        ? ghiChuList.map(gc => `- Gọi lần ${gc.lan_goi} (${gc.thoi_gian_goi}): ${gc.noi_dung || '(không có ghi chú)'}`).join('\n')
        : 'Chưa có ghi chú cuộc gọi nào.';

    const prompt = `Bạn là trợ lý CRM hỗ trợ nhân viên tư vấn bảo hiểm tại Việt Nam chăm sóc khách hàng qua điện thoại.

Dưới đây là lịch sử ghi chú các lần gọi điện cho khách hàng "${customerName}":
${lichSuGoi}

Hãy phân tích và trả lời NGẮN GỌN bằng tiếng Việt, đúng theo cấu trúc sau (không thêm lời chào/kết luận thừa):

**Đánh giá tình trạng khách hàng:**
(1-2 câu nhận định mức độ quan tâm / khả năng chốt hợp đồng của khách, dựa trên các ghi chú trên)

**Lời khuyên chăm sóc tiếp theo:**
- (tối đa 4 gạch đầu dòng, gợi ý hành động cụ thể, thực tế cho lần gọi tiếp theo)`;

    return callGroq({ prompt, temperature: 0.4, maxTokens: 1200 });
}

/**
 * [Dùng cho nút AI Assistant ở leads.html] Phân tích chân dung khách hàng dựa trên hồ sơ
 * đang hiển thị + lịch sử cuộc gọi + ghi chú bổ sung (nếu có) -> gợi ý 3 kịch bản gọi điện.
 * @param {Object} profile - { so_hop_dong, ho_ten, gioi_tinh, dien_thoai, cccd, ngay_sinh,
 *   ngay_tham_gia, nam_dao_han, menh_gia, dia_chi } (các field có thể rỗng nếu chưa có dữ liệu)
 * @param {Array<{khach_hang:string, so_dt_dia_chi:string, ket_qua:string, ghi_chu:string}>} lichSuCuocGoi
 * @param {string} ghiChuBoSung - agent tự gõ thêm thông tin/ngữ cảnh trước khi phân tích
 * @returns {Promise<{phan_tich:string, kich_ban:Array<{tieu_de:string, noi_dung:string}>}>}
 */
async function generateLeadPersonaAndScripts(profile, lichSuCuocGoi = [], ghiChuBoSung = '') {
    const thongTin = [
        profile.ho_ten && `Họ tên: ${profile.ho_ten}`,
        profile.gioi_tinh && `Giới tính: ${profile.gioi_tinh}`,
        profile.ngay_sinh && `Ngày sinh (tuổi): ${profile.ngay_sinh}`,
        profile.dia_chi && `Địa chỉ: ${profile.dia_chi}`,
        profile.so_hop_dong && `Số hợp đồng bảo hiểm: ${profile.so_hop_dong}`,
        profile.ngay_tham_gia && `Ngày tham gia: ${profile.ngay_tham_gia}`,
        profile.nam_dao_han && `Năm đáo hạn: ${profile.nam_dao_han}`,
        profile.menh_gia && `Mệnh giá bảo hiểm: ${profile.menh_gia}`
    ].filter(Boolean).join('\n');

    const lichSuText = (lichSuCuocGoi && lichSuCuocGoi.length > 0)
        ? lichSuCuocGoi.map((c, idx) => `- Lần ${idx + 1}: Kết quả "${c.ket_qua || 'chưa rõ'}"${c.ghi_chu ? ` - Ghi chú: ${c.ghi_chu}` : ''}`).join('\n')
        : 'Chưa có lịch sử cuộc gọi nào trong hệ thống.';

    const boSungText = ghiChuBoSung && ghiChuBoSung.trim()
        ? `\nThông tin bổ sung từ nhân viên tư vấn:\n${ghiChuBoSung.trim()}`
        : '';

    const prompt = `Bạn là chuyên gia tư vấn bảo hiểm tại Việt Nam, hỗ trợ nhân viên telesale phân tích khách hàng trước khi gọi điện chăm sóc.

Thông tin hồ sơ khách hàng:
${thongTin || 'Không có nhiều thông tin.'}

Lịch sử cuộc gọi trước đây:
${lichSuText}
${boSungText}

Hãy trả lời DUY NHẤT một đối tượng JSON hợp lệ (không markdown, không giải thích thêm) đúng cấu trúc sau:
{
  "phan_tich": "Đoạn phân tích chân dung khách hàng 3-5 câu bằng tiếng Việt: độ tuổi/giai đoạn cuộc sống, khả năng tài chính ước tính, mức độ ưu tiên chăm sóc, rủi ro/cơ hội liên quan hợp đồng bảo hiểm hiện tại (đáo hạn, mệnh giá...), có tính đến lịch sử cuộc gọi và thông tin bổ sung nếu có.",
  "kich_ban": [
    { "tieu_de": "Tên ngắn gọn kịch bản 1", "noi_dung": "Gợi ý câu mở đầu và hướng trò chuyện cụ thể, thực tế, khoảng 3-4 câu." },
    { "tieu_de": "Tên ngắn gọn kịch bản 2", "noi_dung": "..." },
    { "tieu_de": "Tên ngắn gọn kịch bản 3", "noi_dung": "..." }
  ]
}`;

    const raw = await callGroq({ prompt, temperature: 0.5, maxTokens: 2000, jsonMode: true });

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        // Phòng trường hợp model lỡ bọc thêm ```json ... ``` dù đã yêu cầu JSON thuần
        const cleaned = raw.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(cleaned);
    }

    return {
        phan_tich: parsed.phan_tich || '',
        kich_ban: Array.isArray(parsed.kich_ban) ? parsed.kich_ban.slice(0, 3) : []
    };
}

module.exports = { generateAiInsight, generateLeadPersonaAndScripts };