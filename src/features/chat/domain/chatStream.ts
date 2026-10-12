export type SseParser = {
  push(chunk: string): void;
  finish(): void;
};

/**
 * Incrementally parses Server-Sent Events and emits the joined data fields.
 * Events without a terminating blank line are intentionally discarded by finish().
 */
export function createSseParser(onData: (data: string) => void): SseParser {
  let buffer = "";
  let dataLines: string[] = [];
  let skipLeadingLineFeed = false;
  let finished = false;
  let atStreamStart = true;

  function processLine(line: string): void {
    if (line === "") {
      if (dataLines.length > 0) {
        onData(dataLines.join("\n"));
      }
      dataLines = [];
      return;
    }

    if (line.startsWith(":")) {
      return;
    }

    const colonIndex = line.indexOf(":");
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? "" : line.slice(colonIndex + 1);

    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "data") {
      dataLines.push(value);
    }
  }

  function consumeLines(): void {
    let lineStart = 0;

    for (let index = 0; index < buffer.length; index += 1) {
      const character = buffer[index];
      if (character !== "\r" && character !== "\n") {
        continue;
      }

      processLine(buffer.slice(lineStart, index));

      if (character === "\r") {
        if (index + 1 < buffer.length && buffer[index + 1] === "\n") {
          index += 1;
        } else if (index + 1 === buffer.length) {
          skipLeadingLineFeed = true;
        }
      }

      lineStart = index + 1;
    }

    buffer = buffer.slice(lineStart);
  }

  return {
    push(chunk: string): void {
      if (finished || chunk.length === 0) {
        return;
      }

      let nextChunk = chunk;
      if (skipLeadingLineFeed) {
        if (nextChunk.startsWith("\n")) {
          nextChunk = nextChunk.slice(1);
        }
        skipLeadingLineFeed = false;
      }

      if (atStreamStart) {
        atStreamStart = false;
        if (nextChunk.startsWith("\uFEFF")) {
          nextChunk = nextChunk.slice(1);
        }
      }

      buffer += nextChunk;
      consumeLines();
    },
    finish(): void {
      if (finished) {
        return;
      }

      finished = true;
      // SSE only dispatches events terminated by a blank line. EOF discards the
      // remaining line and any event data that was not terminated in that way.
      buffer = "";
      dataLines = [];
    }
  };
}
