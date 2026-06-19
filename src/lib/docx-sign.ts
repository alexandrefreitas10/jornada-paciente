import JSZip from 'jszip'

// EMUs: 1 inch = 914400. Signature image ~2 inches wide, ~0.65 inch tall
const SIG_W_EMU = 1828800  // 2 inches
const SIG_H_EMU = 585216   // maintains 500:160 canvas ratio

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fieldParagraphs(filledFields: Record<string, string>): string {
  const entries = Object.entries(filledFields).filter(([, v]) => v?.trim())
  if (entries.length === 0) return ''
  return entries.map(([key, value]) => `
<w:p>
  <w:r>
    <w:rPr><w:b/><w:sz w:val="18"/></w:rPr>
    <w:t xml:space="preserve">${escXml(key)}: </w:t>
  </w:r>
  <w:r>
    <w:rPr><w:sz w:val="18"/></w:rPr>
    <w:t>${escXml(value)}</w:t>
  </w:r>
</w:p>`).join('')
}

function sigXml(rId: string, signerName: string, dateStr: string, filledFields: Record<string, string>): string {
  return `
<w:p>
  <w:pPr>
    <w:pBdr>
      <w:top w:val="single" w:sz="6" w:space="4" w:color="AAAAAA"/>
    </w:pBdr>
    <w:spacing w:before="200"/>
  </w:pPr>
</w:p>
<w:p>
  <w:r>
    <w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="1e3a5f"/></w:rPr>
    <w:t>Documento assinado eletronicamente</w:t>
  </w:r>
</w:p>
<w:p>
  <w:r>
    <w:rPr><w:b/><w:sz w:val="18"/></w:rPr>
    <w:t xml:space="preserve">Assinado por: </w:t>
  </w:r>
  <w:r>
    <w:rPr><w:sz w:val="18"/></w:rPr>
    <w:t>${escXml(signerName)}</w:t>
  </w:r>
</w:p>
<w:p>
  <w:r>
    <w:rPr><w:sz w:val="18"/><w:color w:val="666666"/></w:rPr>
    <w:t>${escXml('Data: ' + dateStr)}</w:t>
  </w:r>
</w:p>
${fieldParagraphs(filledFields)}
<w:p>
  <w:pPr><w:spacing w:before="100"/></w:pPr>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="${SIG_W_EMU}" cy="${SIG_H_EMU}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="9001" name="Assinatura"/>
        <wp:cNvGraphicFramePr>
          <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
        </wp:cNvGraphicFramePr>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="Assinatura"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${SIG_W_EMU}" cy="${SIG_H_EMU}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`
}

export async function embedSignatureInDocx(
  docxBytes: Buffer,
  signerName: string,
  signedAt: string,
  signatureDataUrl: string,
  filledFields: Record<string, string> = {},
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBytes)

  // 1. Add signature PNG to word/media/
  const base64 = signatureDataUrl.replace(/^data:image\/png;base64,/, '')
  const sigPngBytes = Buffer.from(base64, 'base64')
  zip.file('word/media/signature_assinatura.png', sigPngBytes)

  // 2. Add relationship to word/_rels/document.xml.rels
  const relsPath = 'word/_rels/document.xml.rels'
  const relsXml = await zip.file(relsPath)!.async('string')
  const rId = 'rIdAssinatura9001'
  const newRel = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/signature_assinatura.png"/>`
  const updatedRels = relsXml.replace('</Relationships>', `${newRel}</Relationships>`)
  zip.file(relsPath, updatedRels)

  // 3. Inject signature block before </w:body>
  const docPath = 'word/document.xml'
  const docXml = await zip.file(docPath)!.async('string')
  const dateStr = new Date(signedAt).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })
  const injection = sigXml(rId, signerName, dateStr, filledFields)
  const updatedDoc = docXml.replace('</w:body>', `${injection}</w:body>`)
  zip.file(docPath, updatedDoc)

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
