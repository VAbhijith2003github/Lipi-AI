import tiktoken
import re

class RecursiveTokenSplitter:
    """
    Sleek token splitter that splits text by words and merges them
    into chunks up to chunk_size measured in cl100k_base tokens.
    """
    def __init__(self, chunk_size=1000, chunk_overlap=300, encoding_name="cl100k_base"):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.encoding = tiktoken.get_encoding(encoding_name)

    def split_text(self, text: str) -> list[str]:
        splits = re.split(r'(\s+)', text)
        chunks, current, cur_len = [], [], 0
        
        for split in splits:
            if not split.strip() and not current:
                continue
            split_len = len(self.encoding.encode(split))
            if cur_len + split_len <= self.chunk_size:
                current.append(split)
                cur_len += split_len
            else:
                if current:
                    chunks.append("".join(current))
                # Backtrack for overlap
                overlap = []
                overlap_len = 0
                for item in reversed(current):
                    item_len = len(self.encoding.encode(item))
                    if overlap_len + item_len <= self.chunk_overlap:
                        overlap.insert(0, item)
                        overlap_len += item_len
                    else:
                        break
                current = overlap + [split]
                cur_len = overlap_len + split_len
                
                
        if current:
            chunks.append("".join(current))
        return chunks


class StructureAwareChunker:
    """
    Structure-aware, layout-preserving chunker that parses Markdown headings (#, ##, etc.),
    tracks heading hierarchies, and enriches each chunk with section metadata and context headers.
    """
    def __init__(self, chunk_size=1000, chunk_overlap=300, encoding_name="cl100k_base"):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.encoding = tiktoken.get_encoding(encoding_name)
        self._header_pattern = re.compile(r'^(#{1,6})\s+(.+)$')
        self._page_pattern = re.compile(r'^\s*-----\s*Page\s+(\d+)\s*-----\s*$', re.IGNORECASE)

    def split_document(self, text: str = "", page_chunks: list[dict] = None) -> list[dict]:
        """
        Splits text or page_chunks into enriched chunk dicts with section metadata.
        """
        if not page_chunks:
            if not text:
                return []
            page_chunks = [{"page": 1, "text": text}]

        all_chunks = []
        headers_stack = {}
        current_page = 1

        def get_current_section():
            if not headers_stack:
                return "General"
            return " > ".join(headers_stack[lvl] for lvl in sorted(headers_stack.keys()))

        def get_overlap(lines):
            overlap_lines, overlap_len = [], 0
            for line in reversed(lines):
                line_len = len(self.encoding.encode(line + "\n"))
                if overlap_len + line_len <= self.chunk_overlap:
                    overlap_lines.insert(0, line)
                    overlap_len += line_len
                else:
                    break
            return overlap_lines, overlap_len

        for item in page_chunks:
            current_page = item.get("page", current_page)
            page_text = item.get("text", "")
            lines = page_text.splitlines()

            current_lines = []
            current_len = 0

            def finalize():
                nonlocal current_lines, current_len
                raw_text = "\n".join(current_lines).strip()
                if not raw_text:
                    current_lines, current_len = [], 0
                    return

                section = get_current_section()
                enriched_text = f"[Page {current_page} | Section: {section}]\n{raw_text}"
                all_chunks.append({
                    "text": enriched_text,
                    "raw_text": raw_text,
                    "metadata": {"section": section, "page": current_page}
                })

                current_lines, current_len = get_overlap(current_lines)

            for line in lines:
                page_match = self._page_pattern.match(line)
                if page_match:
                    current_page = int(page_match.group(1))
                    continue

                header_match = self._header_pattern.match(line)
                if header_match:
                    level = len(header_match.group(1))
                    title = header_match.group(2).strip()

                    headers_stack = {lvl: txt for lvl, txt in headers_stack.items() if lvl < level}
                    headers_stack[level] = title

                    if current_len > 200:
                        finalize()

                line_tokens = len(self.encoding.encode(line + "\n"))
                if current_len + line_tokens > self.chunk_size and current_lines:
                    finalize()

                current_lines.append(line)
                current_len += line_tokens

            if current_lines:
                finalize()

        return all_chunks


