import React, { useState } from 'react';
import { Plus, Trash2, BookOpen, Edit3, Store } from 'lucide-react';
import type { MarketEntry, MarketEntryInput } from '../shared/validation';
import { api, ApiClientError, formatCurrencyOrMissing } from '../lib/api';

interface Props {
  ownerId: string;
  marketEntries: MarketEntry[];
  onRefresh: () => Promise<void>;
}

export function MarketSupportModule({ ownerId, marketEntries, onRefresh }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<MarketEntry['entry_type']>('sourced_price');
  const [cropName, setCropName] = useState('');
  const [marketName, setMarketName] = useState('');
  const [region, setRegion] = useState('');
  const [recordedDate, setRecordedDate] = useState('2026-10-23');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [priceUnit, setPriceUnit] = useState('INR/quintal');
  const [sourceCitation, setSourceCitation] = useState('');
  const [buyerOrg, setBuyerOrg] = useState('');
  const [buyerContact, setBuyerContact] = useState('');
  const [qualityReq, setQualityReq] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setEditingId(null);
    setCropName('');
    setMarketName('');
    setRegion('');
    setPricePerUnit('');
    setPriceUnit('INR/quintal');
    setSourceCitation('');
    setBuyerOrg('');
    setBuyerContact('');
    setQualityReq('');
    setNotes('');
    setError(null);
  }

  function startEdit(entry: MarketEntry) {
    setEditingId(entry.id);
    setEntryType(entry.entry_type);
    setCropName(entry.crop_name);
    setMarketName(entry.market_name);
    setRegion(entry.region);
    setRecordedDate(entry.recorded_date);
    setPricePerUnit(entry.price_per_unit !== null ? String(entry.price_per_unit) : '');
    setPriceUnit(entry.price_unit || 'INR/quintal');
    setSourceCitation(entry.source_citation);
    setBuyerOrg(entry.buyer_organization || '');
    setBuyerContact(entry.buyer_contact_info || '');
    setQualityReq(entry.quality_requirements || '');
    setNotes(entry.notes || '');
    setError(null);
    setStatusNotice(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusNotice(null);

    if (
      !cropName.trim() ||
      !marketName.trim() ||
      !region.trim() ||
      !recordedDate.trim() ||
      !sourceCitation.trim()
    ) {
      setError(
        'Crop name, market/hub name, region, date, and an explicit source citation are required.'
      );
      return;
    }

    const parsedPrice = pricePerUnit.trim() === '' ? null : Number(pricePerUnit);
    if (parsedPrice !== null && (Number.isNaN(parsedPrice) || parsedPrice < 0)) {
      setError('Price per unit must be a non-negative number or left blank.');
      return;
    }

    const payload: MarketEntryInput = {
      entry_type: entryType,
      crop_name: cropName.trim(),
      market_name: marketName.trim(),
      region: region.trim(),
      recorded_date: recordedDate.trim(),
      price_per_unit: parsedPrice,
      price_unit: priceUnit.trim() || 'INR/quintal',
      source_citation: sourceCitation.trim(),
      buyer_organization: buyerOrg.trim() || null,
      buyer_contact_info: buyerContact.trim() || null,
      quality_requirements: qualityReq.trim() || null,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      const res = editingId
        ? await api.updateMarketEntry(ownerId, editingId, payload)
        : await api.createMarketEntry(ownerId, payload);
      setStatusNotice(
        `${editingId ? 'Updated' : 'Saved'} market entry for "${res.data.crop_name}". ${res.storage_notice}`
      );
      resetForm();
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.issues?.map((i) => i.message).join('; ') || err.message
          : 'Failed to save market entry.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setStatusNotice(null);
    try {
      const res = await api.deleteMarketEntry(ownerId, id);
      if (editingId === id) resetForm();
      setStatusNotice(`Deleted market entry. ${res.storage_notice}`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete market entry');
    }
  }

  const sourcedPrices = marketEntries.filter((m) => m.entry_type === 'sourced_price');
  const buyerDirectory = marketEntries.filter((m) => m.entry_type === 'buyer_contact');

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b-[2.5px] border-primary pb-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2">
            <span className="washi-tape bg-tertiary-fixed text-on-tertiary-fixed font-label-md text-label-md font-bold px-2.5 py-0.5 border-[1.5px] border-primary uppercase tracking-wider inline-block">
              MANDI BENCHMARKS · SEC 06
            </span>
            <span className="font-mono text-xs text-on-surface-variant font-bold">
              // SOURCED PRICES &amp; FPO INTAKE DIRECTORY
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight uppercase">
            Market Support Ledger
          </h1>
          <p className="text-body-md text-on-surface-variant max-w-2xl font-medium">
            Maintain a structured register of sourced APMC mandi prices and known FPO/buyer intake
            requirements. Every entry requires an explicit source citation and date—Green Loop never
            fabricates live ticker prices or guaranteed purchase commitments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-surface-container-lowest border-2 border-primary px-4 py-2 shadow-[3px_3px_0px_#012d1d]">
            <div className="font-mono text-[10px] font-bold text-on-surface-variant uppercase">
              CITED MANDI BENCHMARKS
            </div>
            <div className="font-mono text-lg font-bold text-primary tabular-nums">
              {sourcedPrices.length} RECORDS
            </div>
          </div>
          <div className="bg-surface-container-lowest border-2 border-primary px-4 py-2 shadow-[3px_3px_0px_#012d1d]">
            <div className="font-mono text-[10px] font-bold text-on-surface-variant uppercase">
              FPO &amp; BUYER DESKS
            </div>
            <div className="font-mono text-lg font-bold text-secondary tabular-nums">
              {buyerDirectory.length} CONTACTS
            </div>
          </div>
        </div>
      </div>

      {statusNotice && (
        <div
          role="status"
          className="p-4 bg-secondary-container border-2 border-primary brutal-shadow-sm text-xs font-bold text-on-secondary-container flex items-center justify-between"
        >
          <span>{statusNotice}</span>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-xs font-mono uppercase underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Market Entry Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-surface-container-lowest border-[2.5px] border-primary p-6 shadow-[5px_5px_0px_#012d1d] space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-primary pb-3">
          <div className="flex items-center gap-3">
            <Store className="w-5 h-5 text-primary" />
            <h2 className="font-headline-sm text-base font-bold text-primary uppercase">
              {editingId
                ? 'Edit Sourced Market or Buyer Entry'
                : 'Record Sourced Price or Buyer Intake Entry'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-1 bg-surface-container-low border border-primary font-label-md text-xs font-bold text-primary uppercase hover:bg-tertiary-fixed cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEntryType('sourced_price')}
              className={`px-3 py-1.5 font-label-md text-xs font-bold uppercase border-2 border-primary transition-colors cursor-pointer ${
                entryType === 'sourced_price'
                  ? 'bg-primary text-on-primary brutal-shadow-sm'
                  : 'bg-surface-container-low text-primary hover:bg-tertiary-fixed'
              }`}
            >
              Sourced Mandi Price
            </button>
            <button
              type="button"
              onClick={() => setEntryType('buyer_contact')}
              className={`px-3 py-1.5 font-label-md text-xs font-bold uppercase border-2 border-primary transition-colors cursor-pointer ${
                entryType === 'buyer_contact'
                  ? 'bg-primary text-on-primary brutal-shadow-sm'
                  : 'bg-surface-container-low text-primary hover:bg-tertiary-fixed'
              }`}
            >
              Buyer / FPO Intake Contact
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 bg-error-container border-2 border-error text-xs font-bold text-on-error-container"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="mkt-crop-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              Crop Name *
            </label>
            <input
              id="mkt-crop-input"
              type="text"
              required
              value={cropName}
              onChange={(e) => setCropName(e.target.value)}
              placeholder="e.g., Roma Tomato"
              className="w-full px-3 py-2 text-sm font-bold bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <div>
            <label
              htmlFor="mkt-name-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              Market / APMC / Collection Hub *
            </label>
            <input
              id="mkt-name-input"
              type="text"
              required
              value={marketName}
              onChange={(e) => setMarketName(e.target.value)}
              placeholder="e.g., Pimpalgaon APMC Mandi"
              className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <div>
            <label
              htmlFor="mkt-region-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              District / Region *
            </label>
            <input
              id="mkt-region-input"
              type="text"
              required
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g., Nashik, Maharashtra"
              className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <div>
            <label
              htmlFor="mkt-date-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              Sourced Date *
            </label>
            <input
              id="mkt-date-input"
              type="date"
              required
              value={recordedDate}
              onChange={(e) => setRecordedDate(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono font-bold tabular-nums bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="mkt-price-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              Sourced Modal Price (Optional for Buyer Contact)
            </label>
            <input
              id="mkt-price-input"
              type="number"
              step="0.01"
              min="0"
              value={pricePerUnit}
              onChange={(e) => setPricePerUnit(e.target.value)}
              placeholder="e.g., 2350"
              className="w-full px-3 py-2 text-sm font-mono font-bold tabular-nums bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <div>
            <label
              htmlFor="mkt-unit-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              Price Unit
            </label>
            <input
              id="mkt-unit-input"
              type="text"
              value={priceUnit}
              onChange={(e) => setPriceUnit(e.target.value)}
              placeholder="INR/quintal or INR/kg"
              className="w-full px-3 py-2 text-sm font-mono font-bold bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <div>
            <label
              htmlFor="mkt-source-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              Data Source Citation (Mandatory) *
            </label>
            <input
              id="mkt-source-input"
              type="text"
              required
              value={sourceCitation}
              onChange={(e) => setSourceCitation(e.target.value)}
              placeholder="e.g., Agmarknet Bulletin 23 Oct / FPO Slip"
              className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="mkt-buyer-org-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              Buyer / FPO Organization
            </label>
            <input
              id="mkt-buyer-org-input"
              type="text"
              value={buyerOrg}
              onChange={(e) => setBuyerOrg(e.target.value)}
              placeholder="e.g., Sahyadri FPO Collection Desk"
              className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <div>
            <label
              htmlFor="mkt-buyer-contact-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              Intake Location / Contact Info
            </label>
            <input
              id="mkt-buyer-contact-input"
              type="text"
              value={buyerContact}
              onChange={(e) => setBuyerContact(e.target.value)}
              placeholder="e.g., Gate #2 Mohadi Packhouse"
              className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>

          <div>
            <label
              htmlFor="mkt-quality-req-input"
              className="block font-label-md text-label-md font-bold text-primary uppercase mb-1"
            >
              Quality &amp; Grading Requirements
            </label>
            <input
              id="mkt-quality-req-input"
              type="text"
              value={qualityReq}
              onChange={(e) => setQualityReq(e.target.value)}
              placeholder="e.g., Moisture <= 12%, 20kg crate"
              className="w-full px-3 py-2 text-sm font-medium bg-surface-container-low border-2 border-primary focus:outline-none focus:bg-surface-container-lowest"
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 font-label-md text-xs font-bold uppercase tracking-wider text-on-primary bg-primary border-2 border-primary brutal-shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 transition-transform disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {submitting
              ? 'Saving...'
              : editingId
                ? 'Update Market Record'
                : 'Save Sourced Market Record'}
          </button>
        </div>
      </form>

      {/* Sourced Market Prices Table */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="font-headline-md text-xl font-bold text-primary uppercase">
            Sourced Market Price Benchmarks ({sourcedPrices.length})
          </h2>
        </div>

        <div className="bg-surface-container-lowest border-[2.5px] border-primary shadow-[5px_5px_0px_#012d1d] overflow-x-auto">
          {sourcedPrices.length === 0 ? (
            <div className="p-6 text-center font-mono text-xs text-on-surface-variant">
              No sourced price records logged yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-primary bg-surface-container-low font-label-md text-xs font-bold text-primary uppercase">
                  <th className="py-3.5 px-4">Recorded Date</th>
                  <th className="py-3.5 px-4">Crop</th>
                  <th className="py-3.5 px-4">Market &amp; Region</th>
                  <th className="py-3.5 px-4 text-right">Sourced Price</th>
                  <th className="py-3.5 px-4">Mandatory Source Citation &amp; Specs</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-primary/20 text-xs">
                {sourcedPrices.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-container-low">
                    <td className="py-3.5 px-4 font-mono font-bold tabular-nums text-primary whitespace-nowrap">
                      {item.recorded_date}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-primary text-sm">
                      {item.crop_name}
                      {item.is_demo && (
                        <span className="ml-2 px-1.5 py-0.5 bg-tertiary-fixed border border-primary font-mono text-[10px] font-bold text-on-tertiary-fixed uppercase">
                          Demo Data
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-primary">{item.market_name}</div>
                      <div className="text-on-surface-variant font-mono">{item.region}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-secondary whitespace-nowrap">
                      {item.price_per_unit !== null
                        ? `${formatCurrencyOrMissing(item.price_per_unit)} / ${
                            item.price_unit?.replace('INR/', '') || 'unit'
                          }`
                        : 'Not recorded'}
                    </td>
                    <td className="py-3.5 px-4 max-w-md">
                      <div className="font-bold text-primary">
                        Source: {item.source_citation}
                      </div>
                      {item.quality_requirements && (
                        <div className="text-on-surface-variant mt-0.5">
                          Specs: {item.quality_requirements}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        aria-label={`Edit market entry for ${item.crop_name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-container-low border border-primary font-label-md text-xs font-bold text-primary hover:bg-tertiary-fixed cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        aria-label={`Delete market entry for ${item.crop_name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-error-container border border-primary font-label-md text-xs font-bold text-on-error-container hover:opacity-90 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Buyer & FPO Intake Directory */}
      <div className="space-y-4">
        <h2 className="font-headline-md text-xl font-bold text-primary uppercase">
          Farmer-Recorded Buyer &amp; FPO Intake Directory ({buyerDirectory.length})
        </h2>

        <div className="bg-surface-container-lowest border-[2.5px] border-primary shadow-[5px_5px_0px_#012d1d] overflow-x-auto">
          {buyerDirectory.length === 0 ? (
            <div className="p-6 text-center font-mono text-xs text-on-surface-variant">
              No buyer or FPO intake directory entries recorded yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-primary bg-surface-container-low font-label-md text-xs font-bold text-primary uppercase">
                  <th className="py-3.5 px-4">Organization &amp; Hub</th>
                  <th className="py-3.5 px-4">Accepted Crops</th>
                  <th className="py-3.5 px-4">Contact &amp; Intake Requirements</th>
                  <th className="py-3.5 px-4">Source Citation</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-primary/20 text-xs">
                {buyerDirectory.map((b) => (
                  <tr key={b.id} className="hover:bg-surface-container-low">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-primary text-sm">
                        {b.buyer_organization || b.market_name}
                        {b.is_demo && (
                          <span className="ml-2 px-1.5 py-0.5 bg-tertiary-fixed border border-primary font-mono text-[10px] font-bold text-on-tertiary-fixed uppercase">
                            Demo Data
                          </span>
                        )}
                      </div>
                      <div className="text-on-surface-variant font-mono">{b.region}</div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-primary">{b.crop_name}</td>
                    <td className="py-3.5 px-4 max-w-md">
                      <div className="font-bold text-primary">
                        {b.buyer_contact_info || 'Contact info not recorded'}
                      </div>
                      {b.quality_requirements && (
                        <div className="text-on-surface-variant mt-0.5">
                          Intake Spec: {b.quality_requirements}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-on-surface-variant">
                      {b.source_citation}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => startEdit(b)}
                        aria-label={`Edit buyer entry ${b.market_name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-container-low border border-primary font-label-md text-xs font-bold text-primary hover:bg-tertiary-fixed cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(b.id)}
                        aria-label={`Delete buyer entry ${b.market_name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-error-container border border-primary font-label-md text-xs font-bold text-on-error-container hover:opacity-90 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
