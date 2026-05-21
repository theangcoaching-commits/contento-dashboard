/* SOP demo content templates for ANG Consulting.
   Each SOP follows the structure from the Launch Blueprint section 3.2:
     - Tên + Mã số · Mục tiêu · Người thực hiện · Tần suất · Các bước · Tools · KPI · Templates
   Spread across STARTER / GROWTH / PREMIUM tiers per the offer ladder. */

const wrapper = (title, body) => `
<html><head><meta charset="utf-8"/></head><body>
<h1>${title}</h1>
${body}
<hr/>
<p><i>ANG CONSULTING — Build Once, Scale Forever.</i></p>
</body></html>`;

export const SOP_DEMOS = {
  starter: [
    {
      filename: 'SOP-CT-001 · Content Research Weekly',
      html: wrapper('SOP-CT-001 · Content Research Weekly', `
<p><b>Mục tiêu:</b> Tìm 10-15 ý tưởng content mỗi tuần để không bao giờ hết ý.</p>
<p><b>Người thực hiện:</b> Bạn (30 phút mỗi sáng thứ Hai)</p>
<p><b>Tần suất:</b> 1 lần/tuần</p>
<h2>Các bước</h2>
<ol>
  <li>Mở Notion Content Dashboard → tab "Ideas"</li>
  <li>Check 3 nguồn ý tưởng:
    <ul>
      <li>Video viral của bạn (sort theo views cao nhất tuần trước)</li>
      <li>3-5 kênh đối thủ/người cùng ngành (xem video nào đang trend)</li>
      <li>Comment/DM từ học viên (câu hỏi nào xuất hiện nhiều?)</li>
    </ul>
  </li>
  <li>Dùng AI prompt: <i>"Dựa trên [topic], cho tôi 10 ý tưởng video ngắn cho [ICP] gia sư/giáo viên đang kiếm 15-25tr/tháng, muốn scale lên 50tr+"</i></li>
  <li>Chọn 7 ý tưởng tốt nhất, xếp vào Content Calendar</li>
  <li>Viết hook cho mỗi video (dùng Hook Swipe File — xem SOP-CT-002)</li>
</ol>
<h2>Tools</h2>
<ul><li>Notion (Content Dashboard)</li><li>ChatGPT / Claude</li><li>TikTok / YouTube (research)</li></ul>
<h2>KPI / Checklist</h2>
<ul>
  <li>☐ Ít nhất 7 ý tưởng mới/tuần được thêm vào Calendar</li>
  <li>☐ Mỗi ý tưởng có 1 hook viết sẵn</li>
  <li>☐ Mix 3 tầng funnel: 4 TOFU · 2 MOFU · 1 BOFU</li>
</ul>
<h2>Template kèm theo</h2>
<p>Notion Content Calendar Template (link sẽ được attach sau setup).</p>
`)
    },
    {
      filename: 'SOP-CT-002 · Hook + Script Writing',
      html: wrapper('SOP-CT-002 · Hook + Script Writing', `
<p><b>Mục tiêu:</b> Viết hook 3 giây đầu tiên đủ stop scroll + script ngắn 30-60s cho TikTok / Reels.</p>
<p><b>Người thực hiện:</b> Bạn hoặc trợ giảng (15-20 phút/script)</p>
<p><b>Tần suất:</b> Trước mỗi lần quay (5-7 scripts/tuần)</p>
<h2>Hook Formula (chọn 1 trong 5)</h2>
<ol>
  <li><b>Contrarian:</b> "Mọi người bảo X nhưng thật ra Y…"</li>
  <li><b>Number shock:</b> "Tôi đã làm $10k trong 4 tháng từ việc dạy kèm"</li>
  <li><b>Pain agitate:</b> "Nếu bạn vẫn dạy 12h/ngày mà chỉ kiếm 20tr, video này dành cho bạn"</li>
  <li><b>Curiosity gap:</b> "Đây là 3 lỗi khiến gia sư mất 80% khách"</li>
  <li><b>POV story:</b> "POV: bạn vừa nâng giá từ 2tr lên 8tr/khóa"</li>
</ol>
<h2>Script structure (60s shortform)</h2>
<ul>
  <li>0-3s: <b>HOOK</b> (xài 1 trong 5 formula trên)</li>
  <li>3-10s: <b>SETUP / context</b> ("Tôi đã từng X như bạn")</li>
  <li>10-40s: <b>VALUE</b> (3 điểm chính, mỗi điểm ~10s)</li>
  <li>40-55s: <b>PROOF</b> (case study / số liệu cụ thể)</li>
  <li>55-60s: <b>CTA</b> ("Comment 'COACH' để mình gửi blueprint")</li>
</ul>
<h2>KPI</h2>
<ul>
  <li>☐ Hook ≤ 7 từ</li>
  <li>☐ Script ≤ 60s khi đọc tự nhiên</li>
  <li>☐ 1 CTA rõ ràng, không nhiều hơn</li>
  <li>☐ Test 3 hook variants/idea → chọn cái cao retention nhất</li>
</ul>
<h2>Hook Swipe File (50 templates)</h2>
<p>Xem Google Sheet "Hook Library" trong folder STARTER.</p>
`)
    },
    {
      filename: 'SOP-DEL-001 · Class Setup Checklist',
      html: wrapper('SOP-DEL-001 · Class Setup Checklist', `
<p><b>Mục tiêu:</b> Đảm bảo mọi buổi học đều ready 100% — không khi học viên join mới phát hiện thiếu thứ.</p>
<p><b>Người thực hiện:</b> Bạn + trợ giảng</p>
<p><b>Tần suất:</b> 24h trước mỗi buổi học</p>
<h2>24h trước</h2>
<ul>
  <li>☐ Tạo Zoom link + lưu vào Notion class dashboard</li>
  <li>☐ Send reminder qua Zalo group (auto template)</li>
  <li>☐ Upload slide bài giảng vào Notion → permissions: học viên xem được</li>
  <li>☐ Chuẩn bị 1 file homework / quiz (xài AI generate trong 10 phút)</li>
  <li>☐ Test thiết bị: mic, camera, ánh sáng, internet</li>
</ul>
<h2>30 phút trước</h2>
<ul>
  <li>☐ Mở Zoom 10 phút sớm, test screen share</li>
  <li>☐ Mở Notion class dashboard ở 1 tab</li>
  <li>☐ Mở slide deck full screen</li>
  <li>☐ Có nước uống, sạc laptop</li>
  <li>☐ Tắt notification (Slack, Zalo PC, mail)</li>
</ul>
<h2>Trong buổi (cho trợ giảng)</h2>
<ul>
  <li>☐ Take attendance vào Notion (cột tuần này)</li>
  <li>☐ Note câu hỏi quan trọng từ học viên → "Q&A backlog"</li>
  <li>☐ Track engagement: ai bật mic, ai chat, ai im</li>
  <li>☐ Screenshot moment hay → save làm content material</li>
</ul>
<h2>Sau buổi</h2>
<ul>
  <li>☐ Upload recording lên Notion / Google Drive (folder lớp)</li>
  <li>☐ Gửi homework + deadline qua Zalo</li>
  <li>☐ Nhắc học viên vắng → 1-1 check-in nếu vắng 2 buổi liên tiếp</li>
</ul>
`)
    },
    {
      filename: 'SOP-DEL-002 · Student Onboarding (24-48h)',
      html: wrapper('SOP-DEL-002 · Student Onboarding (24-48h sau payment)', `
<p><b>Mục tiêu:</b> 24-48h đầu quyết định 80% trải nghiệm. Wow học viên ngay từ phút đầu tiên.</p>
<p><b>Người thực hiện:</b> Auto (Zapier) + bạn (Welcome Video cá nhân)</p>
<p><b>Tần suất:</b> Trigger mỗi khi có payment</p>
<h2>Ngay sau payment (tự động)</h2>
<ol>
  <li>Auto-email Welcome Kit với:
    <ul>
      <li>Link Zalo group của lớp</li>
      <li>Lịch học chi tiết (8 buổi, ngày giờ cụ thể)</li>
      <li>Notion workspace link</li>
      <li>Pre-work form: giới thiệu bản thân + mục tiêu (~5 câu)</li>
    </ul>
  </li>
  <li>Gửi Welcome Video cá nhân 2 phút (quay sẵn template, replace tên):
    <ul>
      <li>0-30s: chúc mừng + welcome cá nhân (gọi tên)</li>
      <li>30-90s: 3 điều cần làm ngay (vào group, điền pre-work, đọc workbook)</li>
      <li>90-120s: hẹn gặp ở buổi 1</li>
    </ul>
  </li>
  <li>Thêm vào Student Tracking Dashboard (status: "onboarded")</li>
</ol>
<h2>24h trước buổi đầu tiên</h2>
<ol>
  <li>Auto-reminder qua Zalo: "Mai 8pm vào Zoom nhé"</li>
  <li>"What to expect": buổi 1 sẽ học gì, chuẩn bị giấy bút</li>
  <li>Manual check: học viên đã vào group chưa? Đã điền pre-work chưa? Nếu chưa → gọi 1-1</li>
</ol>
<h2>KPI</h2>
<ul>
  <li>☐ 100% học viên nhận Welcome Kit trong 1h sau payment</li>
  <li>☐ ≥80% học viên hoàn thành pre-work trước buổi 1</li>
  <li>☐ ≥95% học viên show up buổi 1</li>
</ul>
`)
    }
  ],

  growth: [
    {
      filename: 'SOP-SAL-001 · Sales Call Script (SPIN)',
      html: wrapper('SOP-SAL-001 · Sales Call Script (SPIN framework)', `
<p><b>Mục tiêu:</b> Close 30-50% calls bằng script SPIN — không cần hard sell, để khách tự thấy nỗi đau và giải pháp.</p>
<p><b>Người thực hiện:</b> Bạn (40-60 phút/call)</p>
<p><b>Tần suất:</b> Mỗi call</p>
<h2>Cấu trúc 60 phút</h2>
<ul>
  <li>0-5: <b>Warm-up</b> — small talk, set agenda</li>
  <li>5-20: <b>SITUATION</b> — hiểu hiện trạng</li>
  <li>20-35: <b>PROBLEM</b> — đào nỗi đau</li>
  <li>35-45: <b>IMPLICATION</b> — what if không fix?</li>
  <li>45-55: <b>NEED-PAYOFF</b> — solution + offer</li>
  <li>55-60: <b>CLOSE</b></li>
</ul>
<h2>Situation (hiện trạng — 15 phút)</h2>
<ul>
  <li>"Anh/chị đang dạy bao nhiêu học viên?"</li>
  <li>"Trung bình 1 ngày làm việc bao nhiêu tiếng?"</li>
  <li>"Thu nhập hiện tại tầm bao nhiêu/tháng?"</li>
  <li>"Anh/chị đã thử cách nào để scale chưa?"</li>
</ul>
<h2>Problem (đào nỗi đau — 15 phút)</h2>
<ul>
  <li>"Khó khăn lớn nhất hiện tại của anh/chị là gì?"</li>
  <li>"Có lúc nào anh/chị cảm thấy kiệt sức không?"</li>
  <li>"Anh/chị muốn có nhiều thời gian cho ai/việc gì hơn?"</li>
</ul>
<h2>Implication (what if — 10 phút)</h2>
<ul>
  <li>"Nếu 6 tháng nữa vẫn vậy thì sao?"</li>
  <li>"Anh/chị nghĩ chuyện này ảnh hưởng đến gia đình/sức khỏe không?"</li>
  <li>"Đã có ai từ chối làm việc với anh/chị vì giá rẻ chưa? Đó là dấu hiệu gì?"</li>
</ul>
<h2>Need-Payoff (giải pháp — 10 phút)</h2>
<ul>
  <li>"Nếu anh/chị có 1 hệ thống giúp giảm 50% thời gian dạy mà tăng 3x thu nhập trong 8 tuần, anh/chị sẽ thấy thế nào?"</li>
  <li>"Cụ thể, chương trình của tôi sẽ giúp anh/chị… [3 outcomes]"</li>
  <li>"Khác biệt với khóa khác: …"</li>
</ul>
<h2>Close (5 phút)</h2>
<p><b>Soft close:</b> "Nếu tôi chỉ cho anh/chị cách tăng thu nhập gấp 3 trong 2 tháng, anh/chị có sẵn sàng bắt đầu tuần này không?"</p>
<p><b>Pricing reveal:</b> Show 3 tiers — Starter / Growth / Premium. Recommend tier phù hợp dựa trên SPIN trên.</p>
<p><b>Hard close:</b> "Lớp khai giảng thứ Hai tuần sau. Anh/chị muốn join tier nào?"</p>
<h2>KPI</h2>
<ul>
  <li>☐ Close rate ≥ 30%</li>
  <li>☐ Show-up rate ≥ 80%</li>
  <li>☐ Average call ≤ 60 phút</li>
</ul>
`)
    },
    {
      filename: 'SOP-SAL-002 · Lead Qualification (Calendly screening)',
      html: wrapper('SOP-SAL-002 · Lead Qualification — Calendly screening', `
<p><b>Mục tiêu:</b> Filter out tire-kickers TRƯỚC khi call. Save 5-10h/tuần.</p>
<p><b>Tần suất:</b> Setup 1 lần · check leads daily</p>
<h2>Calendly setup</h2>
<ol>
  <li>Tạo event "Discovery Call · 45 phút"</li>
  <li>Thêm 5 câu hỏi sàng lọc (required):
    <ol>
      <li>Bạn đang dạy bao nhiêu học viên? (0 / 1-5 / 6-15 / 16+)</li>
      <li>Thu nhập tháng hiện tại từ việc dạy? (&lt;10tr / 10-30tr / 30-50tr / 50tr+)</li>
      <li>Mục tiêu thu nhập 3 tháng tới? (text)</li>
      <li>Bạn đã thử khóa coaching nào trước đây chưa?</li>
      <li>Tại sao bạn nghĩ chương trình này phù hợp? (50+ ký tự)</li>
    </ol>
  </li>
  <li>Auto-email confirmation + reminder 24h + 1h trước</li>
  <li>Nếu lead trả lời câu 2 = &lt;10tr → auto-route sang FREE webinar thay vì call (filter)</li>
</ol>
<h2>Daily lead review (10 phút sáng)</h2>
<ul>
  <li>Đọc qua từng lead booked → score 1-10 fit</li>
  <li>Score &lt; 5: gửi tư liệu free + reschedule sang group call</li>
  <li>Score 5-7: vẫn call nhưng prepare hard objection</li>
  <li>Score 8+: prioritize, prepare câu hỏi cá nhân</li>
</ul>
<h2>KPI</h2>
<ul>
  <li>☐ % lead score ≥ 7 phải ≥ 50% (nếu thấp, tighten câu hỏi screening)</li>
  <li>☐ No-show rate ≤ 20%</li>
</ul>
`)
    },
    {
      filename: 'SOP-SAL-003 · Objection Handling Library',
      html: wrapper('SOP-SAL-003 · Objection Handling Library', `
<p><b>Mục tiêu:</b> Có sẵn câu trả lời cho mọi objection — không bị bí giữa call.</p>
<h2>Top 5 objections + scripts</h2>
<h3>1. "Đắt quá"</h3>
<p><b>Đáp:</b> "Tôi hiểu — 15tr không phải số nhỏ. Nhưng câu hỏi tôi muốn anh/chị tự trả lời: nếu 6 tháng tới anh/chị thêm 5-10 học viên với giá 5-8tr/khóa, anh/chị nghĩ ROI ra sao? Chương trình của tôi đã giúp 80% học viên đạt break-even trong 4 tuần."</p>
<h3>2. "Không có thời gian"</h3>
<p><b>Đáp:</b> "Đó chính xác là vấn đề chúng ta sẽ fix. Anh/chị đang dạy 12h/ngày vì hệ thống đang ăn thời gian của anh/chị. Chương trình này sẽ giúp anh/chị giảm xuống 6h trong 8 tuần. Anh/chị spend 2h/tuần học là OK chứ?"</p>
<h3>3. "Phải suy nghĩ thêm"</h3>
<p><b>Đáp:</b> "OK, hoàn toàn fair. Cho tôi hỏi cụ thể anh/chị đang suy nghĩ điều gì? Là về (1) commitment thời gian, (2) ngân sách, hay (3) liệu chương trình có work cho anh/chị?"</p>
<h3>4. "Tôi sợ không có kết quả"</h3>
<p><b>Đáp:</b> "Risk reversal: Tuần 1 không hài lòng → hoàn 100%. Sau 8 tuần chưa đạt kết quả → kèm thêm 2 tuần free. Anh/chị literally không có risk."</p>
<h3>5. "Để vợ/chồng quyết"</h3>
<p><b>Đáp:</b> "Tôi tôn trọng. Tôi có thể gửi anh/chị 1 trang summary để show with partner luôn được không? Trong đó có: nội dung chương trình, kết quả case study, và breakdown ROI 6 tháng."</p>
<h2>Cách dùng SOP này</h2>
<p>In ra, để bên cạnh khi call. Đánh dấu objection nào bạn gặp nhiều nhất → luyện hằng ngày trong gương.</p>
`)
    },
    {
      filename: 'SOP-OPS-001 · Weekly Review + KPI Dashboard',
      html: wrapper('SOP-OPS-001 · Weekly Review + KPI Dashboard', `
<p><b>Mục tiêu:</b> Mỗi Chủ Nhật 30 phút review — không drift, luôn biết đang ở đâu so với target.</p>
<p><b>Người thực hiện:</b> Bạn (Chủ Nhật 5pm)</p>
<h2>KPIs cần track hằng tuần</h2>
<table border="1" cellpadding="6" cellspacing="0">
  <tr><th>Funnel stage</th><th>Metric</th><th>Target</th></tr>
  <tr><td>Awareness</td><td>Total views (YT + TT + IG)</td><td>≥ 100K/tuần</td></tr>
  <tr><td>Engagement</td><td>Likes + comments + saves</td><td>≥ 5% of views</td></tr>
  <tr><td>Click-through</td><td>Bio link clicks</td><td>≥ 1% of views</td></tr>
  <tr><td>Lead</td><td>Form submissions</td><td>≥ 20/tuần</td></tr>
  <tr><td>Call booked</td><td>Calendly bookings</td><td>≥ 5/tuần</td></tr>
  <tr><td>Close</td><td>Sales</td><td>≥ 1/tuần</td></tr>
</table>
<h2>Quy trình review (30 phút)</h2>
<ol>
  <li>Mở Contento dashboard → Tracking → My content</li>
  <li>So sánh số tuần này vs tuần trước (mỗi metric)</li>
  <li>Identify 1 metric tốt nhất → tại sao? Lặp lại tuần sau.</li>
  <li>Identify 1 metric tệ nhất → fix bottleneck nào?</li>
  <li>Plan 7 videos cho tuần tới (mix TOFU/MOFU/BOFU)</li>
  <li>Block calendar: nội dung quay + edit + post timing</li>
</ol>
<h2>Template Google Sheet</h2>
<p>Cột: Week · Views · Engagement % · Bio clicks · Leads · Bookings · Sales · Revenue · Note</p>
<p>Cập nhật mỗi Chủ Nhật. Sau 8 tuần, sẽ có trendline rõ ràng.</p>
`)
    }
  ],

  premium: [
    {
      filename: 'SOP-AI-001 · AI Prompt Library (Content Creation)',
      html: wrapper('SOP-AI-001 · AI Prompt Library — Content Creation', `
<p><b>Mục tiêu:</b> Cắt thời gian tạo content từ 4h xuống 30 phút bằng AI prompts đã pre-engineered.</p>
<p><b>Người thực hiện:</b> Bạn / trợ giảng</p>
<h2>Prompt 1: Brainstorm 10 ideas từ 1 topic</h2>
<pre style="background:#f3f3f3;padding:10px">Bạn là content strategist cho 1 coach giúp gia sư scale thu nhập từ 20tr lên 60tr/tháng.
ICP: giáo viên/gia sư VN, 24-35 tuổi, đang dạy 1-1 hoặc nhóm nhỏ.

Cho tôi 10 ý tưởng video TikTok ngắn (30-60s) về topic: [INSERT TOPIC]

Mỗi ý tưởng có:
- Hook 7 từ
- Angle (POV / contrarian / case study / how-to / mistake)
- Mục tiêu (TOFU awareness / MOFU trust / BOFU convert)
- CTA gợi ý

Output format: bảng markdown.</pre>
<h2>Prompt 2: Viết script 60s từ ý tưởng</h2>
<pre style="background:#f3f3f3;padding:10px">Bạn là copywriter cho TikTok. Viết script 60s cho ý tưởng:
[INSERT IDEA]

Cấu trúc:
- 0-3s: Hook stop scroll (≤ 7 từ)
- 3-10s: Setup ("Tôi đã từng…")
- 10-40s: 3 điểm chính (mỗi điểm ~10s)
- 40-55s: Proof / case study
- 55-60s: CTA cụ thể

Style: tiếng Việt casual, dùng "mình"/"bạn", không quá formal. Energy cao, câu ngắn.</pre>
<h2>Prompt 3: Re-purpose 1 longform → 5 shortform</h2>
<pre style="background:#f3f3f3;padding:10px">Tôi có video YouTube dài 15 phút transcript dưới đây:
[PASTE TRANSCRIPT]

Trích xuất 5 đoạn standalone có thể cắt thành TikTok 60s. Mỗi đoạn:
- Timestamp start/end
- Lý do nó standalone được (có hook + value + close trong 60s)
- Hook rewrite cho TikTok (vì YT hook khác TT hook)
- Caption gợi ý</pre>
<h2>Prompt 4: 50 hooks cho 1 niche</h2>
<pre style="background:#f3f3f3;padding:10px">Cho tôi 50 hook 7-từ cho niche "coaching gia sư scale từ 20tr lên 60tr".

Mix 5 formula:
- 10 contrarian ("Mọi người bảo X nhưng…")
- 10 shock-number ("Tôi đã làm $10k…")
- 10 pain-agitate ("Nếu bạn vẫn…")
- 10 curiosity-gap ("Đây là 3 lỗi…")
- 10 POV-story ("POV: bạn vừa…")

Output: numbered list.</pre>
<h2>Prompt 5: Phân tích viral video của đối thủ</h2>
<pre style="background:#f3f3f3;padding:10px">Tôi attach link video viral của đối thủ. Phân tích:
1. Hook là gì? Tại sao work?
2. Cấu trúc 60s như nào? (timestamp breakdown)
3. CTA gì? Có gọi action rõ không?
4. Visual hook ngoài lời? (text overlay, gesture, expression)
5. Replicate cho ANG Consulting niche như thế nào? Đề xuất 3 variants.</pre>
<h2>Cách dùng</h2>
<p>Lưu prompts vào Notion / Raycast snippets. Replace [INSERT…] mỗi lần dùng. Sau 30 ngày dùng, refine theo output bạn thích nhất.</p>
`)
    },
    {
      filename: 'SOP-OPS-002 · 90-Day Scale Plan',
      html: wrapper('SOP-OPS-002 · 90-Day Scale Plan (after 8-week coaching)', `
<p><b>Mục tiêu:</b> Sau 8 tuần coaching, plan 90 ngày tiếp theo để scale từ 30tr → 100tr/tháng.</p>
<p><b>Người thực hiện:</b> Bạn + alumni mastermind</p>
<p><b>Tần suất:</b> Setup 1 lần · review mỗi tháng</p>
<h2>Tháng 1 — STABILIZE</h2>
<p><b>Target:</b> 50tr/tháng · 15 học viên active</p>
<ul>
  <li>Tối ưu hệ thống hiện tại (cut bottlenecks identified trong tuần 6 review)</li>
  <li>Build SOP library hoàn chỉnh (5 SOPs/tuần × 4 tuần = 20 SOPs)</li>
  <li>Thu testimonial từ 3-5 học viên đầu tiên</li>
  <li>1 launch nhỏ (5-10 slots) — practice run</li>
</ul>
<h2>Tháng 2 — DELEGATE</h2>
<p><b>Target:</b> 70tr/tháng · 25 học viên · thuê 1 TA</p>
<ul>
  <li>Hiring TA 25-30k/h (xem SOP-OPS-003)</li>
  <li>Training TA dùng SOP library</li>
  <li>Move 30% delivery work → TA</li>
  <li>Mở thêm 1 lớp parallel (2 lớp/tuần)</li>
  <li>Launch chính thức với public funnel</li>
</ul>
<h2>Tháng 3 — DIGITAL PRODUCT</h2>
<p><b>Target:</b> 100tr/tháng · mini-course launch · evergreen revenue</p>
<ul>
  <li>Launch mini-course/digital product (3-5tr giá thấp, scalable)</li>
  <li>Build email list từ leads → nurture sequence</li>
  <li>Affiliate partnership với 2-3 creators bổ trợ</li>
  <li>Test paid ads ($10-30/ngày) drive cold traffic</li>
  <li>Audit toàn bộ: cut activities &lt;10x ROI</li>
</ul>
<h2>Weekly review (mỗi Chủ Nhật)</h2>
<ol>
  <li>Check 7 KPIs (views · leads · bookings · close · revenue · sátisfaction · retention)</li>
  <li>1 win của tuần</li>
  <li>1 lesson learned</li>
  <li>3 actions cho tuần sau</li>
</ol>
<h2>Risk + mitigation</h2>
<table border="1" cellpadding="6" cellspacing="0">
  <tr><th>Risk</th><th>Mitigation</th></tr>
  <tr><td>Burnout khi scale</td><td>Block 1 ngày/tuần không work. Delegate sớm.</td></tr>
  <tr><td>Quality drop khi lớp đông</td><td>NPS check mid-program. Cap lớp 15 người.</td></tr>
  <tr><td>Content fatigue</td><td>Hire video editor part-time. Repurpose 70%.</td></tr>
  <tr><td>Cash flow lúc launch chậm</td><td>Maintain 3 tháng runway. Pre-sell early bird.</td></tr>
</table>
`)
    }
  ]
};
