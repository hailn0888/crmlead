// check-reminder.js  -  chạy ở thư mục gốc dự án:  node check-reminder.js
// Kiểm tra các file của tính năng Nhắc lịch: có đủ file không, có bị dán lặp / lỗi cú pháp không.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// [đường dẫn, số dòng tham chiếu (bản gốc), có module.exports?]
const FILES = [
    ['services/reminderService.js', 191, true],
    ['services/pushService.js', 79, true],
    ['services/reminderJob.js', 176, true],
    ['routes/reminders.routes.js', 351, true],
    ['routes/calls.routes.js', 0, true],
    ['server.js', 0, false],
    ['public/js/reminderNotifier.js', 0, false],
    ['public/sw.js', 0, false]
];

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log((ok ? '  OK   ' : '  LỖI  ') + msg); };

for (const [rel, refLines, hasExports] of FILES) {
    const file = path.join(__dirname, rel);
    if (!fs.existsSync(file)) { say(false, `${rel}: KHÔNG TỒN TẠI (chưa thêm vào dự án?)`); continue; }
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split(/\r?\n/).length;

    try {
        new vm.Script('(function(exports,require,module,__filename,__dirname){' + src + '\n})', { filename: rel });
    } catch (e) {
        say(false, `${rel}: lỗi cú pháp -> ${e.message}`);
        continue;
    }
    const nExports = (src.match(/module\.exports\s*=/g) || []).length;
    if (hasExports && nExports !== 1) { say(false, `${rel}: có ${nExports} dòng "module.exports =" (phải đúng 1) -> file bị dán lặp hoặc thiếu`); continue; }
    if (refLines && lines > refLines * 1.5) { say(false, `${rel}: dài ${lines} dòng, bản gốc chỉ khoảng ${refLines} -> nhiều khả năng bị dán lặp`); continue; }
    say(true, `${rel} (${lines} dòng)`);
}

// calls.html: các mảnh của Tab 4 phải xuất hiện đúng 1 lần
const htmlFile = path.join(__dirname, 'public/agents/calls.html');
if (fs.existsSync(htmlFile)) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    for (const marker of ['id="tab-content-4"', 'function renderTab4(', 'function rmInitOnLoad(', 'async function rmDone(', 'src="/js/reminderNotifier.js"']) {
        const n = html.split(marker).length - 1;
        say(n === 1, `public/agents/calls.html: "${marker}" xuất hiện ${n} lần${n === 1 ? '' : ' (phải đúng 1)'}`);
    }
} else say(false, 'public/agents/calls.html: KHÔNG TỒN TẠI');

// package.json
try {
    const pkg = require(path.join(__dirname, 'package.json'));
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    say(!!deps['web-push'], 'package.json có "web-push"' + (deps['web-push'] ? '' : '  -> chạy: npm install web-push (rồi commit package.json + package-lock.json)'));
} catch (e) { say(false, 'không đọc được package.json'); }

console.log(bad ? `\n=> Có ${bad} vấn đề cần sửa trước khi push.` : '\n=> Tất cả ổn, có thể commit và push.');
process.exit(bad ? 1 : 0);
