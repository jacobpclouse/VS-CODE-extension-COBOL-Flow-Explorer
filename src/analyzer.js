const RESERVED = new Set(`ACCEPT ADD ALL ALSO ALTER AND AS ASSIGN AT CALL CANCEL CLOSE COMPUTE CONTINUE COPY CORRESPONDING CORR DATA DELETE DISPLAY DIVIDE DIVISION DOWN ELSE END-ADD END-CALL END-COMPUTE END-DELETE END-DIVIDE END-EVALUATE END-IF END-MULTIPLY END-READ END-REWRITE END-SEARCH END-START END-STRING END-SUBTRACT END-UNSTRING END-WRITE EVALUATE EXIT FD FILE FILE-CONTROL FROM GIVING GO GOBACK IF IN INDEXED INITIALIZE INPUT INTO IS LINKAGE MULTIPLY NOT OCCURS OF ON OPEN OR PERFORM PIC PICTURE PROCEDURE PROGRAM-ID READ REDEFINES REPLACING RETURN REWRITE SECTION SELECT SET SORT START STOP STRING SUBTRACT TABLE THEN THRU THROUGH TIMES TO UNSTRING UNTIL USAGE VALUE WHEN WITH WORKING-STORAGE WRITE ZERO ZEROS ZEROES`.split(/\s+/));
const PARAGRAPH_EXCLUSIONS = new Set(`ACCEPT ADD CALL CLOSE COMPUTE CONTINUE DELETE DISPLAY DIVIDE ELSE END-ADD END-CALL END-COMPUTE END-DELETE END-DIVIDE END-EVALUATE END-IF END-MULTIPLY END-READ END-REWRITE END-SEARCH END-START END-STRING END-SUBTRACT END-UNSTRING END-WRITE EVALUATE EXIT GOBACK GO IF INITIALIZE MOVE MULTIPLY OPEN PERFORM READ REWRITE SEARCH SET SORT START STOP STRING SUBTRACT UNSTRING WRITE`.split(/\s+/));

function normalizeSource(source) {
  const lines = source.split(/\r?\n/);
  const fixed = lines.some(line => /^\d{6}[ */-]/.test(line));
  return lines.map((raw, index) => {
    if (fixed) {
      if (raw.length > 6 && ['*', '/'].includes(raw[6])) return { line: index + 1, text: '' };
      return { line: index + 1, text: raw.length > 7 ? raw.slice(7, 72) : '' };
    }
    const code = raw.replace(/\*>.*$/, '');
    return { line: index + 1, text: code };
  });
}

function analyze(source, fileName = 'source.cbl') {
  const lines = normalizeSource(source);
  const variables = new Map();
  const resources = new Map();
  const paragraphs = [];
  let current = null;
  let inData = false;
  let inProcedure = false;
  let currentFile = null;
  const dataStack = [];

  for (const entry of lines) {
    const text = entry.text.trim();
    if (!text) continue;
    const upper = text.toUpperCase();
    if (/^(WORKING-STORAGE|LOCAL-STORAGE|LINKAGE)\s+SECTION\b/.test(upper)) {
      inData = true;
      currentFile = null;
    }
    if (/^FILE\s+SECTION\b/.test(upper)) {
      inData = true;
      currentFile = null;
    }
    if (/^PROCEDURE\s+DIVISION\b/.test(upper)) {
      inData = false;
      inProcedure = true;
      continue;
    }
    if (/^DATA\s+DIVISION\b/.test(upper)) inData = true;

    const select = upper.match(/^SELECT\s+([A-Z0-9-]+)/);
    const fd = upper.match(/^(?:FD|SD)\s+([A-Z0-9-]+)/);
    if (select) resources.set(select[1], { name: select[1], kind: 'file', line: entry.line, items: [] });
    if (fd) {
      resources.set(fd[1], { name: fd[1], kind: 'file', line: entry.line, items: [] });
      currentFile = fd[1];
    }

    const data = upper.match(/^(\d{1,2})\s+([A-Z0-9-]+)\b(.*)$/);
    if (data && !inProcedure) {
      const level = Number(data[1]);
      const name = data[2];
      const detail = data[3];
      if (![66, 77, 88].includes(level)) {
        while (dataStack.length && dataStack[dataStack.length - 1].level >= level) dataStack.pop();
        const parent = dataStack[dataStack.length - 1];
        const item = { name, line: entry.line, level, kind: /\bOCCURS\b/.test(detail) ? 'table' : 'field' };
        if (parent) item.parent = parent.name;
        if (currentFile && resources.has(currentFile)) item.resource = currentFile;
        variables.set(name, item);
        if (currentFile && resources.has(currentFile)) resources.get(currentFile).items.push(name);
        dataStack.push(item);
      }
    }

    if (!inProcedure) continue;
    const paragraphMatch = text.match(/^([A-Z][A-Z0-9-]*)\s*\.\s*$/i);
    if (paragraphMatch && !PARAGRAPH_EXCLUSIONS.has(paragraphMatch[1].toUpperCase())) {
      const name = paragraphMatch[1].toUpperCase();
      if (/^(IDENTIFICATION|ENVIRONMENT|DATA|PROCEDURE|WORKING-STORAGE|LOCAL-STORAGE|LINKAGE|FILE-CONTROL|CONFIGURATION|INPUT-OUTPUT)$/.test(name)) continue;
      current = { name, line: entry.line, statements: [] };
      paragraphs.push(current);
      continue;
    }
    if (!current || /^(?:DECLARATIVES|END\s+DECLARATIVES)\b/i.test(text)) continue;
    current.statements.push({ line: entry.line, text });
  }

  if (paragraphs.length === 0 && inProcedure) paragraphs.push({ name: 'PROCEDURE-DIVISION', line: 1, statements: [] });
  let statementNumber = 0;
  for (const paragraph of paragraphs) {
    paragraph.statements = paragraph.statements.map(raw => {
      const analysis = analyzeStatement(raw.text, variables, resources);
      return { id: `s${++statementNumber}`, paragraph: paragraph.name, line: raw.line, text: raw.text.trim(), ...analysis };
    });
  }

  const edges = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const calls = new Set();
    for (const statement of paragraph.statements) {
      const perform = statement.text.match(/\bPERFORM\s+([A-Z][A-Z0-9-]*)/i);
      const goTo = statement.text.match(/\bGO\s+TO\s+([A-Z][A-Z0-9-]*)/i);
      const target = perform || goTo;
      if (target && paragraphs.some(item => item.name === target[1].toUpperCase())) {
        const name = target[1].toUpperCase();
        calls.add(name);
        edges.push({ from: paragraph.name, to: name, type: perform ? 'perform' : 'goto' });
      }
    }
    paragraph.calls = [...calls];
    if (paragraphs[index + 1] && !paragraph.statements.some(statement => /\b(?:GO\s+TO|GOBACK|STOP\s+RUN)\b/i.test(statement.text))) {
      edges.push({ from: paragraph.name, to: paragraphs[index + 1].name, type: 'next' });
    }
  }

  return {
    fileName,
    paragraphs,
    edges,
    variables: [...variables.values()].sort((a, b) => a.name.localeCompare(b.name)),
    resources: [...resources.values()].sort((a, b) => a.name.localeCompare(b.name)),
    warnings: paragraphs.length === 0 ? ['No PROCEDURE DIVISION paragraphs were recognized.'] : []
  };
}

function analyzeStatement(text, variables, resources) {
  const upper = text.toUpperCase();
  const identifiers = [...new Set(upper.match(/[A-Z][A-Z0-9-]*/g) || [])]
    .filter(name => !RESERVED.has(name) && (variables.has(name) || resources.has(name)));
  const writes = new Set();
  const addTargets = (expression, pattern) => {
    const match = upper.match(pattern);
    if (!match) return;
    for (const name of match[1].match(/[A-Z][A-Z0-9-]*/g) || []) if (variables.has(name)) writes.add(name);
  };

  addTargets(upper, /\bMOVE\b[\s\S]*?\bTO\s+([^.]*)/);
  addTargets(upper, /\b(?:READ|ACCEPT)\b[\s\S]*?\bINTO\s+([^.]*)/);
  addTargets(upper, /\bCOMPUTE\s+([A-Z][A-Z0-9-]*)\s*=/);
  addTargets(upper, /\b(?:ADD|SUBTRACT|MULTIPLY|DIVIDE)\b[\s\S]*?\b(?:TO|FROM|BY|INTO)\s+([A-Z][A-Z0-9-]*)/);
  addTargets(upper, /\b(?:ADD|SUBTRACT|MULTIPLY|DIVIDE)\b[\s\S]*?\bGIVING\s+([^.]*)/);
  addTargets(upper, /\b(?:INITIALIZE|STRING|UNSTRING)\b[\s\S]*?\bINTO\s+([^.]*)/);
  addTargets(upper, /\b(?:SET)\s+([^.]*)\s+TO\b/);

  let kind = 'process';
  let resource = null;
  if (/\bREAD\b/.test(upper)) kind = 'input';
  else if (/\b(?:WRITE|REWRITE)\b/.test(upper)) kind = 'output';
  else if (/\b(?:PERFORM|GO\s+TO)\b/.test(upper)) kind = 'call';
  else if (/\b(?:DELETE|START)\b/.test(upper)) kind = 'file';
  for (const name of resources.keys()) {
    if (identifiers.includes(name)) {
      resource = name;
      break;
    }
  }
  if (!resource) {
    for (const item of resources.values()) {
      if (item.items.some(name => identifiers.includes(name))) {
        resource = item.name;
        break;
      }
    }
  }
  const reads = identifiers.filter(name => !writes.has(name) || /\b(?:ADD|SUBTRACT|MULTIPLY|DIVIDE)\b/.test(upper));
  const tableRefs = identifiers.filter(name => variables.get(name)?.kind === 'table');
  const operation = upper.match(/\b(READ|WRITE|REWRITE|DELETE|START|SEARCH|SORT)\b/);
  return {
    kind,
    reads,
    writes: [...writes],
    identifiers,
    resource,
    operation: operation ? operation[1] : null,
    tableRefs
  };
}

module.exports = { analyze, analyzeStatement, normalizeSource };