"use client";

import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { InputAdornment, MenuItem, Stack, TextField } from "@mui/material";
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
    <Stack gap={1}>
      <TextField
        fullWidth
        label="全文搜索"
        placeholder="输入关键词（空格默认 AND）"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon fontSize="small" color="action" />
            </InputAdornment>
          )
        }}
      />

      <Stack direction={{ xs: "column", sm: "row" }} gap={1}>
        <TextField
          select
          label="文件类型"
          value={type}
          onChange={(event) => {
            onTypeChange(event.target.value as SearchFileType);
          }}
          sx={{ minWidth: { sm: 150 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <TuneRoundedIcon fontSize="small" color="action" />
              </InputAdornment>
            )
          }}
        >
          <MenuItem value="all">全部类型</MenuItem>
          <MenuItem value="md">Markdown</MenuItem>
          <MenuItem value="code">代码</MenuItem>
          <MenuItem value="pdf">PDF</MenuItem>
        </TextField>

        <TextField
          select
          label="排序方式"
          value={sort}
          onChange={(event) => {
            onSortChange(event.target.value as SearchSort);
          }}
          sx={{ minWidth: { sm: 170 } }}
        >
          <MenuItem value="relevance">相关性</MenuItem>
          <MenuItem value="mtime">最近修改</MenuItem>
        </TextField>
      </Stack>
    </Stack>
  );
}
