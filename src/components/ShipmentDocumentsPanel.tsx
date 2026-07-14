import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import DocumentView from './DocumentView'
import EsignPanel from './EsignPanel'
import { documentRefPrefix, generateRef } from '../lib/refGenerator'
import { computeDocumentRows, fetchShipmentDocumentData, renderShipmentDocumentHtml } from '../lib/documentHtml'
import {
  GENERATED_DOCUMENT_TYPES,
  SHIPMENT_DOCUMENT_TYPE_META,
  type Shipment,
  type ShipmentDocument,
  type ShipmentDocumentType,
} from '../types'

interface ShipmentDocumentsPanelProps {
  shipment: Shipment
}

const buttonStyle: CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #1e293b',
  background: 'transparent',
  color: '#94a3b8',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
}

export default function ShipmentDocumentsPanel({ shipment }: ShipmentDocumentsPanelProps) {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<ShipmentDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatingType, setGeneratingType] = useState<ShipmentDocumentType | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadType, setUploadType] = useState<ShipmentDocumentType>('other')
  const [viewing, setViewing] = useState<{ documentType: ShipmentDocumentType; documentRef: string } | null>(null)
  const [consigneeEmail, setConsigneeEmail] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!shipment.consignee_contact_id) return
    supabase
      .from('contacts')
      .select('email')
      .eq('id', shipment.consignee_contact_id)
      .maybeSingle()
      .then(({ data }) => setConsigneeEmail((data as { email: string | null } | null)?.email ?? null))
  }, [shipment.consignee_contact_id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .from('shipment_documents')
      .select('*')
      .eq('shipment_id', shipment.id)
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) setError(fetchError.message)
        else if (data) setDocuments(data as ShipmentDocument[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [shipment.id])

  async function handleGenerate(documentType: ShipmentDocumentType) {
    if (!user) return
    setGeneratingType(documentType)
    setError(null)
    const ref = generateRef(documentRefPrefix(documentType))
    const { data, error: insertError } = await supabase
      .from('shipment_documents')
      .insert({
        org_id: shipment.org_id,
        shipment_id: shipment.id,
        document_type: documentType,
        source: 'generated',
        ref,
        created_by: user.id,
      })
      .select()
      .single()

    if (insertError || !data) {
      setError(insertError?.message ?? 'Could not generate document')
      setGeneratingType(null)
      return
    }
    setDocuments((prev) => [data as ShipmentDocument, ...prev])
    setViewing({ documentType, documentRef: ref })
    setGeneratingType(null)
  }

  async function handleUpload(file: File) {
    if (!user) return
    setUploading(true)
    setError(null)
    const path = `${shipment.org_id}/${shipment.id}/${crypto.randomUUID()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('shipment-documents').upload(path, file)
    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }
    const { data, error: insertError } = await supabase
      .from('shipment_documents')
      .insert({
        org_id: shipment.org_id,
        shipment_id: shipment.id,
        document_type: uploadType,
        source: 'uploaded',
        file_name: file.name,
        storage_path: path,
        created_by: user.id,
      })
      .select()
      .single()

    if (insertError || !data) {
      setError(insertError?.message ?? 'File uploaded, but could not save the record')
      setUploading(false)
      return
    }
    setDocuments((prev) => [data as ShipmentDocument, ...prev])
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDownload(doc: ShipmentDocument) {
    if (!doc.storage_path) return
    const { data, error: signError } = await supabase.storage.from('shipment-documents').createSignedUrl(doc.storage_path, 60)
    if (signError || !data) {
      setError(signError?.message ?? 'Could not create a download link')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Documents
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {GENERATED_DOCUMENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            disabled={generatingType === t}
            onClick={() => void handleGenerate(t)}
            style={buttonStyle}
          >
            {generatingType === t ? 'Generating…' : `Generate ${SHIPMENT_DOCUMENT_TYPE_META[t].label}`}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <select
          value={uploadType}
          onChange={(e) => setUploadType(e.target.value as ShipmentDocumentType)}
          style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: 6, padding: '6px 8px', fontSize: 11.5, color: '#e2e8f0' }}
        >
          {[...GENERATED_DOCUMENT_TYPES, 'other' as const].map((t) => (
            <option key={t} value={t}>
              {SHIPMENT_DOCUMENT_TYPE_META[t].label}
            </option>
          ))}
        </select>
        <input
          ref={fileInputRef}
          type="file"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleUpload(file)
          }}
          style={{ fontSize: 11.5, color: '#94a3b8', flex: 1 }}
        />
      </div>

      {error && <div style={{ fontSize: 12, color: '#fb7185', marginBottom: 10 }}>{error}</div>}

      {loading && <div style={{ fontSize: 12.5, color: '#5b6b82' }}>Loading documents…</div>}
      {!loading && documents.length === 0 && <div style={{ fontSize: 12.5, color: '#5b6b82' }}>No documents yet.</div>}
      {!loading && documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {documents.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0b1220',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12,
              }}
            >
              <div>
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{SHIPMENT_DOCUMENT_TYPE_META[d.document_type].label}</span>
                <span style={{ color: '#5b6b82' }}> · {d.source === 'generated' ? d.ref : d.file_name}</span>
              </div>
              {d.source === 'generated' ? (
                <button type="button" onClick={() => setViewing({ documentType: d.document_type, documentRef: d.ref ?? '' })} style={buttonStyle}>
                  View
                </button>
              ) : (
                <button type="button" onClick={() => void handleDownload(d)} style={buttonStyle}>
                  Download
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <DocumentView shipment={shipment} documentType={viewing.documentType} documentRef={viewing.documentRef} onClose={() => setViewing(null)} />
      )}

      {(() => {
        const bol = documents.find((d) => d.document_type === 'bill_of_lading' && d.source === 'generated')
        return (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              E-Signature (Bill of Lading)
            </div>
            {bol ? (
              <EsignPanel
                orgId={shipment.org_id}
                documentType="bill_of_lading"
                documentRef={bol.ref ?? ''}
                documentLabel="Bill of Lading"
                shipmentId={shipment.id}
                defaultRecipientEmail={consigneeEmail ?? undefined}
                buildHtml={async () => {
                  const data = await fetchShipmentDocumentData(shipment)
                  const rows = computeDocumentRows('bill_of_lading', shipment, data, bol.ref ?? '')
                  return renderShipmentDocumentHtml('bill_of_lading', shipment, rows, bol.ref ?? '')
                }}
              />
            ) : (
              <div style={{ fontSize: 11.5, color: '#5b6b82' }}>Generate a Bill of Lading above before sending it for signature.</div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
