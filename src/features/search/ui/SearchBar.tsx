"use client";

import { Stack, TextField } from "@mui/material";
import type { SearchFileType, SearchSort } from "@/features/search/domain/types";

export function SearchBar({
  query,
  type,
  sort,
  onQueryChange,
  onTypeChange,
  onSortChange
}: {
  query: string;
  type: SearchFileType;
  sort: SearchSort;
  onQueryChange: (value: string) => void;
  onTypeChange: (value: SearchFileType) => void;
  onSortChange: (value: SearchSort) => void;
}): React.JSX.Element {
  return (
    <Stack direction={{ xs: "column", md: "row" }} gap={1}>
      <TextField
        fullWidth
        label="全文搜索"
        placeholder="输入关键词（空格默认 AND）"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
        }}
      />

      <TextField
        select
        label="类型"
        value={type}
        onChange={(event) => {
          onTypeChange(event.target.value as SearchFileType);
        }}
        SelectProps={{ native: true }}
        sx={{ minWidth: 140 }}
      >
        <option value="all">all</option>
        <option value="md">md</option>
        <option value="code">code</option>
        <option value="pdf">pdf</option>
      </TextField>

      <TextField
        select
        label="排序"
        value={sort}
        onChange={(event) => {
          onSortChange(event.target.value as SearchSort);
        }}
        SelectProps={{ native: true }}
        sx={{ minWidth: 160 }}
      >
        <option value="relevance">相关性</option>
        <option value="mtime">最近修改</option>
      </TextField>
    </Stack>
  );
}
