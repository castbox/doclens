"use client";

import { Box, Button, Container, Paper, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchPanel } from "@/features/search/ui/SearchPanel";

export function SearchPageClient({ initialQuery }: { initialQuery: string }): React.JSX.Element {
  const router = useRouter();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 1.5, md: 2 } }}>
      <Stack spacing={1.25}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
          <Box>
            <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">
              全局搜索
            </Typography>
            <Typography variant="body2" color="text.secondary">
              支持目录范围、文件类型与排序过滤
            </Typography>
          </Box>
          <Button variant="outlined" component={Link} href="/docs">
            返回 /docs
          </Button>
        </Stack>

        <Paper variant="outlined" sx={{ p: { xs: 1, md: 1.25 }, bgcolor: "rgba(255,255,255,0.92)" }}>
          <SearchPanel
            initialQuery={initialQuery}
            onOpenHit={(path, line) => {
              const params = new URLSearchParams({ path });
              const hash = line > 0 ? `#L${line}` : "";
              router.push(`/docs?${params.toString()}${hash}`);
            }}
          />
        </Paper>
      </Stack>
    </Container>
  );
}
