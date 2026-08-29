# Blueprint Template

> **Khác với SPEC ở chỗ nào?**
> - **SPEC**: trả lời "làm gì, tại sao" (what & why).
> - **Blueprint**: trả lời "làm như thế nào ở mức giả định" (how — assumption-based, dùng để brainstorm trước khi spec xong).

Blueprint được dùng **TRƯỚC** Spec — để khám phá nhanh một module, sau đó kết quả sẽ được đúc lại thành Module Specification.

---

## Cấu trúc

```markdown
# Blueprint: <Tên module>

## Vấn đề
...

## Phạm vi giả định (Assumptions)
- ...

## Câu hỏi cần trả lời (Open Questions)
- ...

## Workflow dự kiến

### Workflow 1: <tên>
Mermaid sequence / flow:

\`\`\`mermaid
sequenceDiagram
  participant U as User
  participant S as System
  U->>S: ...
  S-->>U: ...
\`\`\`

## Màn hình dự kiến
| Màn hình | Mục đích |
| --- | --- |

## Entity dự kiến
| Entity | Field chính |
| --- | --- |

## Rule dự kiến (preview)
| Rule | Mô tả |
| --- | --- |

## API dự kiến
| Endpoint | Method | Description |
| --- | --- | --- |

## Rủi ro & giảm thiểu
| Rủi ro | Giảm thiểu |
| --- | --- |
```

---

## Quy tắc

- Mỗi blueprint **có file riêng**, lưu vào `docs/03_Specification/<Module>/BLUEPRINT.md`.
- Sau khi blueprint đủ chín muồi → tái cấu trúc thành `SPEC.md` (10 mục).
- Khi viết SPEC, **giữ link ngược** về BLUEPRINT.md.
