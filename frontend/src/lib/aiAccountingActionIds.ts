const ACTION_PATH_PATTERN =
  /\/api\/v1\/actions\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\/(?:approve|reject))?/g;
const ACTION_ID_TOKEN_PATTERN =
  /(?:action_id[:\s]+)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/gi;

/** Extract unique AI action IDs from assistant text / route evidence. */
export function extractAiAccountingActionIds(...sources: Array<string | null | undefined>): string[] {
  const found = new Set<string>();

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const pattern of [ACTION_PATH_PATTERN, ACTION_ID_TOKEN_PATTERN]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null = pattern.exec(source);
      while (match) {
        found.add(match[1]);
        match = pattern.exec(source);
      }
    }
  }

  return Array.from(found);
}
