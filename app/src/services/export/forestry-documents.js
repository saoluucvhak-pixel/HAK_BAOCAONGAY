import { displayDecimal } from '../../utils/display-format.js';
import JSZip from 'jszip';

const font = 'Times New Roman';
const country = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
const motto = 'Độc lập - Tự do - Hạnh phúc';
const border = { style: 'thin', color: { argb: 'FF000000' } };

function topLines(page) {
  return [
    [page.unit ?? '', country],
    [page.company, motto],
    ['', page.reference ?? ''],
  ];
}

function formLabel(page) {
  return 'Mẫu số ' + page.number + (page.description ? ': ' + page.description : '');
}

function rowsForPrinting(page) {
  const count = page.widths.length;
  const rows = page.rows.length ? page.rows : Array.from({ length: 3 }, () => Array(count).fill(''));
  return rows;
}

export function forestryWorkbook(ExcelJS, pages) {
  const workbook = new ExcelJS.Workbook();
  for (const page of pages) {
    const last = page.widths.length;
    const split = Math.floor(last / 2);
    const sheet = workbook.addWorksheet(page.name, { pageSetup: {
      paperSize: 9, orientation: page.landscape ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 },
    } });
    sheet.columns = page.widths.map(width => ({ width }));
    function write(row, column, value, { across = 1, down = 1, bold = false, italic = false, align = 'center', size = 11 } = {}) {
      if (across > 1 || down > 1) sheet.mergeCells(row, column, row + down - 1, column + across - 1);
      const cell = sheet.getCell(row, column);
      cell.value = value;
      cell.font = { name: font, size, bold, italic };
      cell.alignment = { horizontal: align, vertical: 'middle', wrapText: true };
      return cell;
    }
    write(1, 1, formLabel(page), { across: last, bold: true, align: page.number === '14' ? 'right' : 'left', size: 12 });
    topLines(page).forEach(([left, right], i) => {
      write(i + 2, 1, left, { across: split, bold: i < 2 });
      write(i + 2, split + 1, right, { across: last - split, bold: i < 2, italic: i === 2 });
      sheet.getRow(i + 2).height = 20;
    });
    write(6, 1, page.title, { across: last, bold: true, size: 14 });
    sheet.getRow(6).height = 23;
    write(7, 1, '(' + page.period + ')', { across: last, italic: true });
    sheet.getRow(7).height = 21;
    const headerStart = 9;
    page.headers.forEach((cells, index) => {
      const row = headerStart + index;
      sheet.getRow(row).height = page.heights[index];
      for (const { column, text, across, down } of cells) {
        write(row, column + 1, text, { across, down, bold: true, size: page.number === '04' ? 10 : 11 });
      }
    });
    const dataStart = headerStart + page.headers.length;
    const dataRows = rowsForPrinting(page);
    dataRows.forEach((values, index) => {
      const row = dataStart + index;
      let maxLines = 1;
      values.forEach((value, column) => {
        const cell = write(row, column + 1, value, { size: 10, align: typeof value === 'number' ? 'right' : 'center' });
        if (page.dateColumns?.includes(column)) {
          cell.alignment = { ...cell.alignment, wrapText: false, shrinkToFit: true };
          return;
        }
        const isSerial = column === 0 && page.number !== '04';
        if (typeof value === 'number' && !isSerial) cell.numFmt = page.number === '14' ? '#,##0.00' : '#,##0.000';
        const lines = String(value ?? '').split('\n').reduce((count, line) =>
          count + Math.max(1, Math.ceil(line.length / Math.max(5, page.widths[column] - 1))), 0);
        maxLines = Math.max(maxLines, lines);
      });
      sheet.getRow(row).height = Math.min(390, Math.max(20, maxLines * 13 + 4));
    });
    for (let row = headerStart; row < dataStart + dataRows.length; row++) {
      for (let column = 1; column <= last; column++) {
        sheet.getCell(row, column).border = { top: border, bottom: border, left: border, right: border };
      }
    }
    const signedAt = dataStart + dataRows.length + 1;
    if (page.number === '29') write(signedAt, split + 1, '……, ngày …… tháng …… năm ………', { across: last - split, italic: true });
    write(signedAt + 1, 1, page.signatures[0], { across: split, bold: true, size: 12 });
    write(signedAt + 1, split + 1, page.signatures[1], { across: last - split, bold: true, size: 12 });
    write(signedAt + 2, 1, page.signatureNotes[0], { across: split, italic: true });
    write(signedAt + 2, split + 1, page.signatureNotes[1], { across: last - split, italic: true });
    let end = signedAt + 5;
    if (page.notes) {
      write(end++, 1, 'Ghi chú', { across: last, bold: true, italic: true, align: 'left' });
      for (const note of page.notes) {
        write(end, 1, note, { across: last, align: 'left', size: 10 });
        sheet.getRow(end++).height = note.length > 160 ? 32 : 19;
      }
    }
    sheet.pageSetup.printTitlesRow = headerStart + ':' + (dataStart - 1);
    sheet.pageSetup.printArea = 'A1:' + sheet.getCell(end, last).address;
  }
  return workbook;
}

function xml(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);
}

function paragraph(value = '', { size = 22, align = 'center', bold = false, italic = false, after = 0, keep = false } = {}) {
  const text = String(value ?? '').split(/\r?\n/).map(line => '<w:t xml:space="preserve">' + xml(line) + '</w:t>').join('<w:br/>');
  return '<w:p><w:pPr>' + (keep ? '<w:keepNext/>' : '') + '<w:spacing w:after="' + after + '"/><w:jc w:val="' + align +
    '"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '"/>' +
    (bold ? '<w:b/>' : '') + (italic ? '<w:i/>' : '') + '<w:sz w:val="' + size + '"/></w:rPr>' + text + '</w:r></w:p>';
}

function wordCell(content, width, { span = 1, merge = '', noWrap = false } = {}) {
  return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' +
    (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
    (merge ? '<w:vMerge w:val="' + merge + '"/>' : '') +
    (noWrap ? '<w:noWrap/>' : '') + '<w:vAlign w:val="center"/></w:tcPr>' + content + '</w:tc>';
}

function wordTable(widths, rows, bordered) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  const edges = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'];
  const borders = bordered ? '<w:tblBorders>' +
    edges.map(edge => '<w:' + edge + ' w:val="single" w:sz="4"/>').join('') + '</w:tblBorders>' : '';
  return '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/>' + borders +
    '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="28" w:type="dxa"/><w:left w:w="35" w:type="dxa"/>' +
    '<w:bottom w:w="28" w:type="dxa"/><w:right w:w="35" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
    widths.map(width => '<w:gridCol w:w="' + width + '"/>').join('') + '</w:tblGrid>' + rows + '</w:tbl>';
}

function twoColumns(width, values) {
  const widths = [Math.floor(width / 2), Math.ceil(width / 2)];
  return wordTable(widths, '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
    values.map((value, index) => wordCell(value, widths[index])).join('') + '</w:tr>', false);
}

function bodyTable(page, width) {
  const total = page.widths.reduce((sum, value) => sum + value, 0);
  const widths = page.widths.map(value => Math.floor(value * width / total));
  const active = [];
  const fontSize = page.number === '04' ? 16 : 20;
  const header = page.headers.map((cells, index) => {
    const merged = [...active.filter(cell => cell.until >= index), ...cells.map(cell => ({ ...cell, first: index, until: index + cell.down - 1 }))];
    active.push(...merged.filter(cell => cell.first === index && cell.until > index));
    merged.sort((left, right) => left.column - right.column);
    return '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' +
      merged.map(cell => wordCell(paragraph(cell.first === index ? cell.text : '', { bold: true, size: fontSize }),
        widths.slice(cell.column, cell.column + cell.across).reduce((sum, part) => sum + part, 0),
        { span: cell.across, merge: cell.down > 1 ? cell.first === index ? 'restart' : 'continue' : '' })).join('') +
      '</w:tr>';
  }).join('');
  const precision = page.number === '14' ? 2 : 3;
  const data = rowsForPrinting(page).map(row => '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
    row.map((value, index) => {
      const numeric = typeof value === 'number' && (index !== 0 || page.number === '04');
      return wordCell(paragraph(numeric ? displayDecimal(value, precision, precision) : value, {
        size: fontSize, align: numeric ? 'right' : 'center',
      }), widths[index], { noWrap: page.dateColumns?.includes(index) });
    }).join('') + '</w:tr>').join('');
  return wordTable(widths, header + data, true);
}

function wordPage(page) {
  const width = page.landscape ? 16838 : 11906;
  const height = page.landscape ? 11906 : 16838;
  const contentWidth = width - 1440;
  const headings = topLines(page);
  const head = [0, 1].map(column => headings.map((line, index) =>
    paragraph(line[column], { bold: index < 2, italic: index === 2, size: 22 })).join(''));
  const signatures = page.signatures.map((name, index) =>
    paragraph(page.number === '29' && index === 1 ? '……, ngày …… tháng …… năm ………' : '', { italic: true }) +
    paragraph(name, { bold: true }) + paragraph(page.signatureNotes[index], { italic: true }) +
    paragraph('') + paragraph(''));
  const notes = page.notes ? paragraph('Ghi chú', { bold: true, italic: true, align: 'left', keep: true }) +
    page.notes.map(note => paragraph(note, { size: 19, align: 'left', after: 32 })).join('') : '';
  return {
    content: paragraph(formLabel(page), { bold: true, align: page.number === '14' ? 'right' : 'left', after: 120 }) +
      twoColumns(contentWidth, head) + paragraph('') + paragraph(page.title, { bold: true, size: 29, keep: true }) +
      paragraph('(' + page.period + ')', { italic: true, after: 180, keep: true }) + bodyTable(page, contentWidth) +
      paragraph('', { keep: true }) + twoColumns(contentWidth, signatures) + notes,
    section: '<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="' + width + '" w:h="' + height + '"' +
      (page.landscape ? ' w:orient="landscape"' : '') +
      '/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>',
  };
}

export async function forestryWord(pages) {
  const zip = new JSZip();
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  zip.file('[Content_Types].xml', declaration + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const body = pages.map(wordPage).map(({ content, section }, index) =>
    content + (index === pages.length - 1 ? section : '<w:p><w:pPr>' + section + '</w:pPr></w:p>')).join('');
  zip.file('word/document.xml', declaration +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '</w:body></w:document>');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
