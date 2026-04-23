import { BlockBase, BlockDef, MarkdownGeneratorContext } from "../base";
import { Box, Text, Table } from '@chakra-ui/react';

export interface TableData {
    format?: string;
    showHeaders?: boolean;
    caption?: string;
    data: string; // JSON string
    align?: Array<"center" | "left" | "right" | null>;
    columns?: string[];
}

export interface TableBlockDef extends BlockDef {
    kind: "table";
    data: TableData;
}

export class TableBlock extends BlockBase {
    static kind = "table";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        let parsedData: any[] = [];
        let headers: string[] = [];

        try {
            parsedData = JSON.parse(this.def.data.data || "[]");
            if (parsedData.length > 0) {
                headers = Object.keys(parsedData[0]);
            }
        } catch (e) {
            console.error("Failed to parse table data", e);
        }

        const showHeaders = this.def.data.showHeaders !== false;

        return (
            <Box>
                <Table.Root>
                    {this.def.data.caption && (
                        <Table.Caption>{this.def.data.caption}</Table.Caption>
                    )}
                    {showHeaders && headers.length > 0 && (
                        <Table.Header>
                            <Table.Row>
                                {headers.map((header, i) => (
                                    <Table.ColumnHeader key={i}>{header}</Table.ColumnHeader>
                                ))}
                            </Table.Row>
                        </Table.Header>
                    )}
                    <Table.Body>
                        {parsedData.map((row, rowIdx) => (
                            <Table.Row key={rowIdx}>
                                {headers.map((header, cellIdx) => (
                                    <Table.Cell key={cellIdx}>{row[header]}</Table.Cell>
                                ))}
                            </Table.Row>
                        ))}
                    </Table.Body>
                </Table.Root>
            </Box>
        );
    }

    is_md_representable(): boolean {
        return true;
    }

    is_md_block(): boolean {
        return true;
    }

    as_markdown(ctx: MarkdownGeneratorContext): string {
        if (this.children.length > 0) {
            const rows = this.children;
            const headerRow = rows[0];
            const bodyRows = rows.slice(1);
            const headerCells = headerRow.children;
            const headerTexts = headerCells.map(cell => cell.as_markdown(ctx));
            const align = headerCells.map(cell => cell.def?.data?.align ?? null);

            const alignCell = (value: string | null) => {
                if (value === "center") return ":---:";
                if (value === "right") return "---:";
                if (value === "left") return ":---";
                return "---";
            };

            const headerMd = `| ${headerTexts.join(" | ")} |`;
            const separatorMd = `| ${align.map(alignCell).join(" | ")} |`;
            const bodyMd = bodyRows.map(row => {
                const cells = row.children.map(cell => cell.as_markdown(ctx));
                return `| ${cells.join(" | ")} |`;
            }).join("\n");

            return [headerMd, separatorMd, bodyMd].filter(Boolean).join("\n");
        }

        let parsedData: any[] = [];
        let headers: string[] = [];

        try {
            parsedData = JSON.parse(this.def.data.data || "[]");
            if (parsedData.length > 0) {
                headers = Object.keys(parsedData[0]);
            }
        } catch (e) {
            return "";
        }

        const widths = computeColumnWidths(headers, parsedData);
        const showHeaders = this.def.data.showHeaders !== false;

        const pad = (value: string, width: number) =>
            value + " ".repeat(width - value.length);
    
        let md = "";
        if (showHeaders && headers.length > 0) {
            md += "| " + headers.map(h => pad(h, widths[h])).join(" | ") + " |\n";
            const align = this.def.data.align ?? [];
            const alignCell = (value: string | null, width: number) => {
                if (value === "center") return ":" + "-".repeat(Math.max(width - 2, 1)) + ":";
                if (value === "right") return "-".repeat(Math.max(width - 1, 1)) + ":";
                if (value === "left") return ":" + "-".repeat(Math.max(width - 1, 1));
                return "-".repeat(width);
            };
            md += "| " + headers.map((h, i) => alignCell(align[i] ?? null, widths[h])).join(" | ") + " |\n";
        }
        parsedData.forEach(row => {
            md += "| " + headers.map(h => pad(row[h] != null ? String(row[h]) : "", widths[h])).join(" | ") + " |\n";
        });
        return md;
    }
}


function computeColumnWidths(
    headers: string[],
    rows: any[]
): Record<string, number> {
    const widths: Record<string, number> = {};

    // Initialize with header widths
    headers.forEach(h => {
        widths[h] = h.length;
    });

    // Expand based on cell values
    rows.forEach(row => {
        headers.forEach(h => {
            const value = row[h] != null ? String(row[h]) : "";
            widths[h] = Math.max(widths[h], value.length);
        });
    });

    return widths;
}