import { defaultSchema, type Options as MarkdownSanitizeSchema } from "rehype-sanitize";

const MARKDOWN_TAG_NAMES = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "details",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "kbd",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul"
];

const GLOBAL_ATTRIBUTES = ["id", "title", "ariaLabel", "ariaLabelledBy", "ariaDescribedBy"];

export const markdownSanitizeSchema: MarkdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: MARKDOWN_TAG_NAMES,
  strip: ["script", "style"],
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "tel"],
    src: [...(defaultSchema.protocols?.src ?? [])]
  },
  attributes: {
    ...defaultSchema.attributes,
    "*": GLOBAL_ATTRIBUTES,
    a: [
      ...GLOBAL_ATTRIBUTES,
      "href",
      "title",
      "target",
      "rel",
      "className",
      "dataFootnoteBackref",
      "dataFootnoteRef"
    ],
    code: [["className", /^language-./]],
    img: [...GLOBAL_ATTRIBUTES, "src", "alt", "title", "width", "height"],
    input: [["type", "checkbox"], "checked", "disabled"],
    section: [...GLOBAL_ATTRIBUTES, "className", "dataFootnotes"],
    span: [...GLOBAL_ATTRIBUTES, "className"],
    summary: [...GLOBAL_ATTRIBUTES, "className"],
    table: [...GLOBAL_ATTRIBUTES, "className"],
    td: [...GLOBAL_ATTRIBUTES, "align"],
    th: [...GLOBAL_ATTRIBUTES, "align"]
  }
};
