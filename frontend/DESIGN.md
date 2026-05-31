# ReadMind — Design System (MASTER)

> Hệ thống thiết kế cho cuộc redesign giao diện ReadMind. Tổng hợp từ taste-skill
> (dials, AI Tells, redesign protocol) + ui-ux-pro-max (pattern AI-Native UI) và
> đối chiếu giao diện hiện tại. **Nguyên tắc xuyên suốt: tránh các "AI Tells" để
> sản phẩm có bản sắc riêng, không trông như UI được generate.**
>
> Đây là **Redesign – Preserve**: giữ kiến trúc, IA, thương hiệu cốt lõi; hiện đại
> hóa theo 4 đòn bẩy (typography → spacing → màu → motion). KHÔNG đập đi xây lại.

---

## 0. Tóm tắt định hướng (Brief Inference)

ReadMind là RAG chatbot đọc tài liệu theo "phòng" (room) cô lập, anonymous-first.
Bản chất sản phẩm: **công cụ đọc-hỏi-đáp tập trung vào nội dung**. Vì vậy giao diện
phải **lùi lại nhường chỗ cho nội dung** (đọc là chính), không phô diễn hiệu ứng.

Pattern nền tảng (ui-ux-pro-max xác nhận): **AI-Native UI** — streaming text,
typing indicator, minimal chrome, context cards. Hướng này đúng; chỉ cần loại bỏ
phần "trang trí AI" thừa.

---

## 1. Dial Settings (taste-skill)

| Dial | Giá trị | Lý do |
|---|---|---|
| **DESIGN_VARIANCE** | 2–3 (Predictable) | App công cụ, không phải landing. Bố cục dễ đoán, ổn định, không layout lệch nghệ thuật. |
| **MOTION_INTENSITY** | 3–4 (Fluid CSS, tiết chế) | Giữ streaming/typing/feedback; bỏ particle nền + floating icons + gradient động. Mọi motion > 3 phải tôn trọng `prefers-reduced-motion`. |
| **VISUAL_DENSITY** | khu chat 2–3 (thoáng, "đọc"), sidebar 5–6 (app) | Khu trả lời cần khoảng trắng để đọc; sidebar dày hơn vì là công cụ thao tác. |

---

## 2. AI Tells đang dính (PHẢI sửa)

Đối chiếu Section 9 của taste-skill với code hiện tại:

| Tell | Hiện trạng | Bản sửa |
|---|---|---|
| **AI-purple** | accent `#6366f1` + gradient tím→hồng (`--accent`, `.gradient-text`) | Đổi sang accent có bản sắc (teal sâu), bỏ gradient tím→hồng |
| **Gradient text header** | tiêu đề EmptyState dùng `.gradient-text` | Header dùng trọng lượng + màu, KHÔNG gradient |
| **Inter / font hệ thống mặc định** | `-apple-system, ...` không chủ đích | Chọn cặp có gu: heading `Outfit`, body `Work Sans` (self-host) |
| **Lucide "egg" avatar** | `User`/`Sparkles` của Lucide làm avatar | Mark thương hiệu ReadMind cho avatar AI |
| **Nhiễu thị giác** | particle background + floating icons + glass chồng nhiều lớp | Tắt particle mặc định, bỏ floating icons, giảm lớp glass |
| **Pure values** | (kiểm tra) tránh `#000000`/`#ffffff` thuần | Dùng off-black/off-white |

---

## 3. Color System (bỏ AI-purple)

Định hướng: **nền trung tính ấm + MỘT accent teal sâu có chủ đích** (teal phân
biệt với cả AI-purple lẫn default-blue, hợp "reading focus / trustworthy"). Một
accent duy nhất dùng nhất quán toàn app (Color Consistency Lock).

### Light
```
--bg-primary:      #FAFAF9   /* off-white ấm, KHÔNG #ffffff thuần */
--bg-secondary:    #F4F4F2
--bg-tertiary:     #E9E9E6
--text-primary:    #1C1917   /* off-black ấm, KHÔNG #000 thuần */
--text-secondary:  #57534E
--text-tertiary:   #A8A29E
--border-primary:  #E2E0DC
--accent:          #0D9488   /* teal sâu — accent DUY NHẤT */
--accent-hover:    #0F766E
--accent-light:    rgba(13,148,136,0.10)
--success:         #15803D
--warning:         #B45309
--error:           #B91C1C
```

### Dark (off-black, không xanh-tím)
```
--bg-primary:      #1A1A18   /* charcoal ấm trung tính, KHÔNG #0f0f1a tím */
--bg-secondary:    #232320
--bg-tertiary:     #2D2D29
--text-primary:    #F5F5F3
--text-secondary:  #C7C5BF
--text-tertiary:   #8C8A84
--border-primary:  #3A3A35
--accent:          #2DD4BF   /* teal sáng hơn cho nền tối, vẫn cùng họ */
--accent-hover:    #5EEAD4
```

Quy tắc: WCAG AA cho body (AAA cho tiêu đề lớn). Accent teal phải đạt 4.5:1 trên
nền tương ứng cho text/icon. Giữ hierarchy parity giữa light/dark.

---

## 4. Typography (không Inter mặc định)

Cặp "Geometric Modern" — có bản sắc, vẫn dễ đọc, self-host để không phụ thuộc
Google CDN runtime:

```
Heading:  Outfit    (500/600/700)
Body:     Work Sans (400/500/600)
Mono:     dùng cho mã/code block (giữ ui-monospace stack hiện có)
```

- Tiêu đề: kiểm soát phân cấp bằng **weight + màu**, KHÔNG bằng kích thước khổng
  lồ, KHÔNG gradient.
- Body chat: cỡ thoải mái đọc (`16px`/`1.6`), đo dòng vừa phải.

---

## 5. Motion (tiết chế)

Giữ lại (feedback/storytelling thật):
- Streaming text + con trỏ nhấp nháy khi đang trả lời.
- Typing indicator 3 chấm.
- Fade/slide nhẹ khi message xuất hiện (`y: 8–12`, 200–300ms, ease `[0.16,1,0.3,1]`).
- Hover/active scale nhẹ trên nút (≤ 1.02).

Bỏ (trang trí thừa):
- `ParticleBackground` bật mặc định ở khu chat.
- `floatingIcons` trong EmptyState.
- `gradient-shift` animation cho text.

Bắt buộc: mọi motion gói trong `prefers-reduced-motion: reduce` → tắt/đứng yên.

---

## 6. Surfaces & Shape

- **Glass**: giữ nhưng tiết chế — chỉ dùng cho sidebar, modal, input bar. KHÔNG
  chồng glass-trên-glass-trên-particle ở khu đọc. Khu chat dùng nền phẳng
  `--bg-chat` cho dễ đọc.
- **Corner radius**: một hệ thống nhất quán (Shape Consistency Lock):
  `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`, bubble: `16px`.
- **Bóng**: tinted shadow nhẹ theo accent, KHÔNG neon/outer-glow.

---

## 7. UX dễ-hiểu (quan trọng hơn thẩm mỹ)

1. **"Phòng"**: thay nhãn `Phòng: A7K2-9XQp` (mã trần khó hiểu) bằng:
   - Nhãn rõ nghĩa + nút **"Chia sẻ phòng"** (icon link) tách bạch.
   - Tooltip/onboarding một dòng giải thích "Phòng = không gian tài liệu riêng".
   (Đã có onboarding ở sidebar — đồng bộ ngôn từ.)
2. **i18n toàn bộ tiếng Việt**: gom mọi chuỗi tiếng Anh còn sót về một chỗ:
   - `MobileHeader`: "RAG Chat" → "ReadMind", "Start a conversation" → "Bắt đầu trò chuyện".
   - Banner: "No documents selected / Select documents..." → tiếng Việt.
   - `UrlIngest`: "Ingest URL", "Please enter a valid URL" → tiếng Việt.
   - `MessageBubble`/`InlineError`: "Retry", "Something went wrong" → tiếng Việt.
3. **Avatar**: mark thương hiệu ReadMind (chữ/biểu tượng) thay icon Lucide.
4. **Empty/loading/error states**: giữ đủ 3 trạng thái (đã có), thống nhất ngôn từ.

---

## 8. Phạm vi giữ nguyên (Redesign – Preserve)

KHÔNG đổi nếu chưa được duyệt:
- IA / luồng (chat, ingest, room, auth, My Rooms, Notion).
- Hợp đồng API (SSE, endpoints), hành vi nghiệp vụ.
- Cấu trúc component lớn (chỉ refactor visual token + bỏ trang trí).
- Tên route, localStorage keys.

---

## 9. Pre-Flight Check (rút gọn cho redesign này)

- [ ] ZERO em-dash (`—`/`–`) ở mọi chuỗi hiển thị (dùng `-`).
- [ ] Một accent (teal) dùng nhất quán mọi nơi.
- [ ] Một hệ corner-radius.
- [ ] Một theme-lock mỗi trang; light + dark đều test.
- [ ] KHÔNG gradient text header; KHÔNG AI-purple; KHÔNG particle nền mặc định.
- [ ] Font Outfit/Work Sans nạp đúng, có fallback.
- [ ] Mọi chuỗi tiếng Việt (không trộn Anh-Việt).
- [ ] Contrast WCAG AA (AAA cho tiêu đề); focus state rõ; `prefers-reduced-motion` tôn trọng.
- [ ] Responsive 375 / 768 / 1024 / 1440.
- [ ] Avatar dùng mark thương hiệu, không Lucide-egg.

---

## 10. Nguồn tham khảo

- taste-skill (dials, Section 9 AI Tells, Section 11 Redesign Protocol, Pre-Flight).
- ui-ux-pro-max: pattern **AI-Native UI** (streaming, typing, minimal chrome).
- Định hướng các sản phẩm AI hàng đầu (ChatGPT/Claude/Gemini): tối giản, để nội
  dung thở, chrome nhẹ, một accent.
- Lưu ý: tool search gợi ý Inter + AI-purple #6366F1 — **đã loại bỏ có chủ đích**
  theo lệnh cấm AI Tells của taste-skill.
