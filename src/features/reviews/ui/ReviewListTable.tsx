"use client";

import { Chip, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import Link from "next/link";
import type { ReviewSheet } from "@/features/reviews/domain/types";
import { formatDateTime } from "@/shared/domain/time";

export function ReviewListTable({ rows }: { rows: ReviewSheet[] }): React.JSX.Element {
  if (rows.length === 0) {
    return <Typography color="text.secondary">暂无审阅单。</Typography>;
  }

  return (
    <Paper variant="outlined" sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>标题</TableCell>
            <TableCell>文档</TableCell>
            <TableCell>状态</TableCell>
            <TableCell>结论</TableCell>
            <TableCell>Reviewer</TableCell>
            <TableCell>更新时间</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} hover>
              <TableCell>
                <Typography component={Link} href={`/reviews/${row.id}`} color="primary" sx={{ fontWeight: 600, cursor: "pointer" }}>
                  {row.title}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography className="mono" variant="caption">
                  {row.docPath}
                </Typography>
              </TableCell>
              <TableCell>
                <Chip size="small" label={row.status} variant="outlined" />
              </TableCell>
              <TableCell>{row.conclusion}</TableCell>
              <TableCell>{row.reviewer}</TableCell>
              <TableCell>{formatDateTime(row.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
