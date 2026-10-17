import type { ReactNode } from 'react'

/** 에이전트가 남긴 마크다운을 읽기 좋게 보여준다. 제목, 목록, 표, 인용, 코드 블록, 굵게, 코드 정도만 다룬다 */
export function Markdown({ text }: { text: string }) {
  return <div className="markdown">{parseBlocks(text.replace(/\r\n/g, '\n').split('\n'))}</div>
}

function parseBlocks(lines: string[]): ReactNode[] {
  const out: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = out.length

    if (!line.trim()) {
      i++
      continue
    }

    const fence = line.match(/^\s*```/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++])
      i++
      out.push(<pre key={key}>{body.join('\n')}</pre>)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = Math.min(heading[1].length + 3, 6)
      const Tag = `h${level}` as 'h4' | 'h5' | 'h6'
      out.push(<Tag key={key}>{inline(heading[2])}</Tag>)
      i++
      continue
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push(<hr key={key} />)
      i++
      continue
    }

    // 표: 머리 줄 다음에 |---|---| 구분 줄이 온다
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]))
      out.push(
        <table key={key}>
          <thead>
            <tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, j) => (
              <tr key={j}>{head.map((_, k) => <td key={k}>{inline(r[k] ?? '')}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      )
      continue
    }

    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(<blockquote key={key}>{parseBlocks(body)}</blockquote>)
      continue
    }

    const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
    if (listItem.test(line)) {
      const ordered = /\d/.test(line.match(listItem)![2])
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i].match(listItem)
        if (m) items.push(m[3])
        // 들여 쓴 다음 줄은 앞 항목에 이어 붙인다
        else if (/^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1] += ' ' + lines[i].trim()
        else break
        i++
      }
      const List = ordered ? 'ol' : 'ul'
      out.push(<List key={key}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</List>)
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i])) para.push(lines[i++])
    if (para.length === 0) para.push(lines[i++])
    out.push(<p key={key}>{para.map((p, j) => <span key={j}>{j > 0 && <br />}{inline(p)}</span>)}</p>)
  }
  return out
}

function cells(row: string) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

/** **굵게**, `코드` */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>
    return part
  })
}
