import React, { useRef, useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, CircularProgress, useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { UploadCloud, FileSpreadsheet, Download, X, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { ChoiceChips } from './admin/AdminChrome';

const HEADER_ALIASES = {
  name: ['name', 'medicine', 'medicinename', 'brand', 'brandname', 'product', 'productname', 'item', 'itemname'],
  genericName: ['generic', 'genericname', 'composition', 'salt', 'formula'],
  category: ['category', 'type', 'group'],
  quantity: ['quantity', 'qty', 'stock', 'units', 'shelfqty', 'shelfquantity', 'count'],
  batchNumber: ['batch', 'batchnumber', 'batchno', 'batchid', 'lot', 'lotnumber'],
  expiryDate: ['expiry', 'expirydate', 'exp', 'expdate', 'expiresat', 'expiry date'],
  description: ['description', 'notes', 'details']
};

const normalizeHeader = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const FIELD_FOR_HEADER = Object.entries(HEADER_ALIASES).reduce((acc, [field, aliases]) => {
  aliases.forEach((a) => { acc[normalizeHeader(a)] = field; });
  return acc;
}, {});

const TEMPLATE_COLUMNS = {
  main: ['Medicine Name', 'Generic Name', 'Category', 'Quantity', 'Batch Number', 'Expiry Date', 'Description'],
  store: ['Medicine Name', 'Quantity', 'Batch Number', 'Expiry Date']
};

const TEMPLATE_SAMPLE = {
  main: [
    ['Dolo 650', 'Paracetamol 650mg', 'Pain Relief', 200, 'B-1001', '2027-12-31', 'Fever and pain'],
    ['Azithral 500', 'Azithromycin 500mg', 'Antibiotic', 80, 'B-1002', '2027-06-30', '']
  ],
  store: [
    ['Dolo 650', 20, 'B-1001', '2027-12-31'],
    ['Azithral 500', 10, 'B-1002', '2027-06-30']
  ]
};

const pad = (n) => String(n).padStart(2, '0');

const toIsoDate = (value) => {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const text = String(value).trim();
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${pad(dmy[2])}-${pad(dmy[1])}`;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const mapRows = (sheetRows) => sheetRows.map((raw, index) => {
  const row = { _row: index + 2 };
  Object.entries(raw).forEach(([header, value]) => {
    const field = FIELD_FOR_HEADER[normalizeHeader(header)];
    if (field && (row[field] === undefined || row[field] === '')) row[field] = value;
  });

  const name = String(row.name ?? '').trim();
  const qtyText = String(row.quantity ?? '').trim();
  const quantity = qtyText === '' ? NaN : Number(qtyText);
  const expiry = toIsoDate(row.expiryDate);

  let error = '';
  if (!name) error = 'Medicine name is missing';
  else if (!Number.isFinite(quantity)) error = 'Quantity must be a number';
  else if (quantity < 0) error = 'Quantity cannot be negative';

  return {
    _row: row._row,
    name,
    genericName: String(row.genericName ?? '').trim(),
    category: String(row.category ?? '').trim(),
    description: String(row.description ?? '').trim(),
    batchNumber: String(row.batchNumber ?? '').trim(),
    quantity,
    expiryDate: expiry || '',
    warning: expiry === null ? 'Expiry date not recognised, it will be skipped' : '',
    error
  };
}).filter((r) => r.name || Number.isFinite(r.quantity));

const InventoryUploadDialog = ({ open, onClose, mode = 'main', onUploaded }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const brand = theme.palette.brand || { main: theme.palette.primary.main, soft: '#F8FAFC', border: '#E2E8F0', dark: theme.palette.primary.dark };
  const inputRef = useRef(null);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [qtyMode, setQtyMode] = useState('replace');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const validRows = rows.filter((r) => !r.error);
  const errorRows = rows.filter((r) => r.error);

  const reset = () => {
    setFileName('');
    setRows([]);
    setResult(null);
    setQtyMode('replace');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const downloadTemplate = async (type) => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS[mode], ...TEMPLATE_SAMPLE[mode]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    const base = mode === 'main' ? 'warehouse-inventory-template' : 'store-inventory-template';
    XLSX.writeFile(wb, `${base}.${type}`, { bookType: type === 'csv' ? 'csv' : 'xlsx' });
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      toast.error('Please choose a .csv, .xlsx or .xls file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File is too large (max 10 MB)');
      return;
    }
    setParsing(true);
    setResult(null);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
      const mapped = mapRows(sheetRows);
      if (mapped.length === 0) {
        toast.error('No rows found. Check that the first row has column headers.');
        setRows([]);
        setFileName('');
        return;
      }
      if (!mapped.some((r) => r.name)) {
        toast.error('Could not find a "Medicine Name" column');
      }
      setRows(mapped);
      setFileName(file.name);
    } catch (err) {
      console.error(err);
      toast.error('Could not read this file');
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (validRows.length === 0) {
      toast.error('No valid rows to upload');
      return;
    }
    setUploading(true);
    try {
      const payload = validRows.map(({ warning, error, ...r }) => r);
      const endpoint = mode === 'main' ? '/inventory/main/bulk' : '/inventory/store/bulk';
      const res = await api.post(endpoint, { rows: payload, mode: qtyMode });
      setResult(res.data);
      toast.success(`Uploaded: ${res.data.created} added, ${res.data.updated} updated`);
      if (onUploaded) onUploaded(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const columns = TEMPLATE_COLUMNS[mode];

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={fullScreen}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : '20px' } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            <Box sx={{ width: 42, height: 42, borderRadius: '12px', bgcolor: brand.soft, color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileSpreadsheet size={22} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1.05rem' }}>
                {mode === 'main' ? 'Upload warehouse stock' : 'Upload shelf stock'}
              </Typography>
              <Typography sx={{ color: '#64748B', fontSize: '0.8rem' }}>CSV or Excel (.csv, .xlsx, .xls)</Typography>
            </Box>
          </Box>
          <IconButton onClick={handleClose} disabled={uploading}><X size={20} /></IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {result ? (
          <Box>
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Box sx={{ width: 56, height: 56, borderRadius: '18px', bgcolor: '#DCFCE7', color: '#16A34A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                <CheckCircle2 size={28} />
              </Box>
              <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1.1rem' }}>Upload complete</Typography>
              <Typography sx={{ color: '#64748B', fontSize: '0.85rem' }}>{fileName}</Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: `repeat(${mode === 'main' ? 4 : 3}, 1fr)` }, gap: 1.5, mb: 2 }}>
              {[
                { label: 'Added', value: result.created, color: '#16A34A' },
                { label: 'Updated', value: result.updated, color: '#0369A1' },
                ...(mode === 'main' ? [{ label: 'New medicines', value: result.newMedicines, color: '#7C3AED' }] : []),
                { label: 'Skipped', value: result.skipped?.length || 0, color: '#DC2626' }
              ].map((s) => (
                <Box key={s.label} sx={{ p: 1.75, borderRadius: '14px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.6rem', color: s.color, lineHeight: 1.1 }}>{s.value}</Typography>
                  <Typography sx={{ color: '#64748B', fontWeight: 700, fontSize: '0.75rem', mt: 0.5 }}>{s.label}</Typography>
                </Box>
              ))}
            </Box>
            {result.skipped?.length > 0 && (
              <Box sx={{ border: '1px solid #FECACA', bgcolor: '#FEF2F2', borderRadius: '14px', p: 1.5 }}>
                <Typography sx={{ fontWeight: 800, color: '#991B1B', fontSize: '0.85rem', mb: 1 }}>Skipped rows</Typography>
                <Box sx={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {result.skipped.map((s, i) => (
                    <Typography key={i} sx={{ fontSize: '0.8rem', color: '#7F1D1D' }}>
                      Row {s.row}{s.name ? ` (${s.name})` : ''}: {s.reason}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        ) : (
          <>
            {/* Template + drop zone */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, p: 1.5, borderRadius: '14px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <Typography sx={{ fontSize: '0.82rem', color: '#475569', minWidth: 0 }}>
                Columns: <b>{columns.join(', ')}</b>
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" startIcon={<Download size={14} />} onClick={() => downloadTemplate('xlsx')} sx={{ borderRadius: '10px', fontWeight: 800 }}>
                  Excel template
                </Button>
                <Button size="small" variant="outlined" startIcon={<Download size={14} />} onClick={() => downloadTemplate('csv')} sx={{ borderRadius: '10px', fontWeight: 800 }}>
                  CSV
                </Button>
              </Box>
            </Box>

            <Box
              onClick={() => !parsing && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
              sx={{
                border: '2px dashed',
                borderColor: dragOver ? 'primary.main' : '#CBD5E1',
                bgcolor: dragOver ? brand.soft : '#FFFFFF',
                borderRadius: '16px',
                p: { xs: 3, sm: rows.length ? 2.5 : 5 },
                textAlign: 'center',
                cursor: parsing ? 'wait' : 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': { borderColor: 'primary.main', bgcolor: brand.soft }
              }}
            >
              <input
                ref={inputRef}
                type="file"
                hidden
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              {parsing ? (
                <CircularProgress size={28} />
              ) : (
                <>
                  <Box sx={{ color: 'primary.main', display: 'inline-flex', mb: 1 }}><UploadCloud size={rows.length ? 26 : 36} /></Box>
                  <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '0.95rem' }}>
                    {fileName ? `${fileName} · click to choose another file` : 'Drag & drop your file here, or click to browse'}
                  </Typography>
                  {!fileName && (
                    <Typography sx={{ color: '#64748B', fontSize: '0.8rem', mt: 0.5 }}>
                      First row must be the column headers. Max 5000 rows.
                    </Typography>
                  )}
                </>
              )}
            </Box>

            {rows.length > 0 && (
              <>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Chip label={`${rows.length} rows`} sx={{ fontWeight: 800 }} />
                  <Chip icon={<CheckCircle2 size={14} />} label={`${validRows.length} ready`} sx={{ fontWeight: 800, bgcolor: '#DCFCE7', color: '#166534', '& .MuiChip-icon': { color: '#16A34A' } }} />
                  {errorRows.length > 0 && (
                    <Chip icon={<AlertTriangle size={14} />} label={`${errorRows.length} with errors (will be skipped)`} sx={{ fontWeight: 800, bgcolor: '#FEE2E2', color: '#991B1B', '& .MuiChip-icon': { color: '#DC2626' } }} />
                  )}
                </Box>

                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748B', mb: 0.8 }}>IF THE MEDICINE IS ALREADY IN STOCK</Typography>
                  <ChoiceChips
                    options={[
                      { value: 'replace', label: 'Replace quantity' },
                      { value: 'add', label: 'Add to quantity' }
                    ]}
                    value={qtyMode}
                    onChange={setQtyMode}
                  />
                  {mode === 'store' && (
                    <Typography sx={{ color: '#64748B', fontSize: '0.76rem', mt: 1 }}>
                      Medicine names must match the warehouse catalog. Unknown names are skipped.
                    </Typography>
                  )}
                  {mode === 'main' && (
                    <Typography sx={{ color: '#64748B', fontSize: '0.76rem', mt: 1 }}>
                      Medicines not in the catalog yet are added automatically.
                    </Typography>
                  )}
                </Box>

                <TableContainer sx={{ border: '1px solid #E2E8F0', borderRadius: '14px', maxHeight: { xs: 320, sm: 300 } }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Medicine</TableCell>
                        {mode === 'main' && <TableCell>Generic</TableCell>}
                        {mode === 'main' && <TableCell>Category</TableCell>}
                        <TableCell align="center">Qty</TableCell>
                        <TableCell>Batch</TableCell>
                        <TableCell>Expiry</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.slice(0, 200).map((r) => (
                        <TableRow key={r._row} sx={{ bgcolor: r.error ? '#FEF2F2' : 'inherit' }}>
                          <TableCell sx={{ color: '#94A3B8', fontWeight: 700 }}>{r._row}</TableCell>
                          <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{r.name || '—'}</TableCell>
                          {mode === 'main' && <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.genericName || '—'}</TableCell>}
                          {mode === 'main' && <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.category || '—'}</TableCell>}
                          <TableCell align="center" sx={{ fontWeight: 800 }}>{Number.isFinite(r.quantity) ? r.quantity : '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.batchNumber || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.expiryDate || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {r.error ? (
                              <Typography sx={{ color: '#DC2626', fontWeight: 700, fontSize: '0.78rem' }}>{r.error}</Typography>
                            ) : r.warning ? (
                              <Typography sx={{ color: '#B45309', fontWeight: 700, fontSize: '0.78rem' }}>{r.warning}</Typography>
                            ) : (
                              <Typography sx={{ color: '#16A34A', fontWeight: 700, fontSize: '0.78rem' }}>Ready</Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {rows.length > 200 && (
                  <Typography sx={{ color: '#64748B', fontSize: '0.76rem' }}>Showing the first 200 rows. All {rows.length} rows will be processed.</Typography>
                )}
              </>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
        {result ? (
          <>
            <Button startIcon={<RefreshCw size={16} />} onClick={reset} sx={{ fontWeight: 800 }}>Upload another file</Button>
            <Button variant="contained" onClick={handleClose} sx={{ fontWeight: 800, px: 3 }}>Done</Button>
          </>
        ) : (
          <>
            <Button onClick={handleClose} disabled={uploading} sx={{ color: 'text.secondary', fontWeight: 700 }}>Cancel</Button>
            <Button
              variant="contained"
              disabled={uploading || validRows.length === 0}
              startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadCloud size={16} />}
              onClick={handleUpload}
              sx={{ fontWeight: 800, px: 3 }}
            >
              {uploading ? 'Uploading...' : `Upload ${validRows.length || ''} row${validRows.length === 1 ? '' : 's'}`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default InventoryUploadDialog;
