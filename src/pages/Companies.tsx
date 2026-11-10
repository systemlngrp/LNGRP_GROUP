import React, { useState, useRef, useMemo } from "react";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { Plus, Edit, Trash2, Upload, Download } from "lucide-react";
import { Company } from "../types";
import { Spinner } from "../components/Spinner";
import { MasterHeader } from "../components/MasterHeader";
import { ReportFilterBox, SelectFilter, toFilterOptions } from "../components/ReportFilterBox";
import { ClientPagination } from "../components/ClientPagination";
import { MandatoryLabel, MandatoryLegend } from "../components/Mandatory";
import { isMandatoryField } from "../lib/mandatoryFields";
import { useClientPagination } from "../hooks/useClientPagination";
import { useTableSearch } from "../lib/tableSearch";
import * as XLSX from "xlsx";
import { SortHeader, useTableSort } from "../lib/tableSort";

export function Companies() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [companies, setCompanies, isLoading] = useData<Company>("companies", []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [stateField, setStateField] = useState("");
  const [gstNo, setGstNo] = useState("");
  const [gstSupplyType, setGstSupplyType] = useState<"" | "INTRA_STATE" | "INTER_STATE">("INTRA_STATE");
  const [deviationAllowed, setDeviationAllowed] = useState<number | "">("");
  const [toleranceAllowed, setToleranceAllowed] = useState<number | "">("");
  const [pin, setPin] = useState("");
  const [salesPerson, setSalesPerson] = useState("");
  const [gstType, setGstType] = useState("");
  const [panNo, setPanNo] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [openingBalance, setOpeningBalance] = useState<number | "">("");
  const [overdues, setOverdues] = useState<number | "">("");
  const [target, setTarget] = useState<number | "">("");
  const [reffPerson, setReffPerson] = useState("");
  const [priority, setPriority] = useState("");
  const [followupFrequency, setFollowupFrequency] = useState("");
  const [autoEmail, setAutoEmail] = useState("");
  const [followupApproval, setFollowupApproval] = useState("");
  const [active, setActive] = useState<"Yes" | "No">("Yes");

  const resetForm = () => {
    setName("");
    setContactPerson("");
    setContactNumber("");
    setEmail("");
    setAddress("");
    setDistrict("");
    setStateField("");
    setGstNo("");
    setGstSupplyType("INTRA_STATE");
    setDeviationAllowed("");
    setToleranceAllowed("");
    setPin("");
    setSalesPerson("");
    setGstType("");
    setPanNo("");
    setPaymentTerms("");
    setOpeningBalance("");
    setOverdues("");
    setTarget("");
    setReffPerson("");
    setPriority("");
    setFollowupFrequency("");
    setAutoEmail("");
    setFollowupApproval("");
    setActive("Yes");
    setEditingId(null);
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        "Company Name": "Example Company Ltd",
        "Contact Person": "John Doe",
        "Contact Number": "9876543210",
        "Email Id": "john@example.com",
        "Address": "123 Business Park",
        "District": "Mumbai",
        "State": "Maharashtra",
        "GST NO": "27AAAAA0000A1Z5",
        "GST Supply Type": "INTRA_STATE",
        "Deviation Allowed (%)": 5,
        "Tolerance Allowed (%)": 2,
        "PIN": "400001",
        "Sales Person": "Jane Smith",
        "GST Type": "Regular",
        "PAN No": "ABCDE1234F",
        "PAYMENT TERMS": "30 Days",
        "OPENING BALANCE": 0,
        "OVERDUES": 0,
        "TARGET": 100000,
        "REFF. PERSON": "Reference Person",
        "Priority": "High",
        "Followup Frequency": "Weekly",
        "Auto Email": "Yes",
        "Followup Approval": "Pending",
        "Active": "Yes"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Companies_Bulk_Upload_Template.xlsx");
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) {
          alert("The file is empty.");
          return;
        }

        setIsSubmitting(true);
        const audit = { updatedBy: "System User", updateTimestamp: new Date().toISOString() };
        const newCompanies: Company[] = data.map((row: any) => ({
          id: crypto.randomUUID(),
          name: String(row["Company Name"] || row["Company"] || "").trim(),
          contactPerson: String(row["Contact Person"] || "").trim() || undefined,
          contactNumber: String(row["Contact Number"] || "").trim() || undefined,
          email: String(row["Email Id"] || "").trim() || undefined,
          address: String(row["Address"] || "").trim() || undefined,
          district: String(row["District"] || "").trim() || undefined,
          state: String(row["State"] || "").trim() || undefined,
          gstNo: String(row["GST NO"] || "").trim() || undefined,
          gstSupplyType: (row["GST Supply Type"] === "INTER_STATE" ? "INTER_STATE" : "INTRA_STATE") as any,
          deviationAllowed: row["Deviation Allowed (%)"] ? Number(row["Deviation Allowed (%)"]) : undefined,
          toleranceAllowed: row["Tolerance Allowed (%)"] ? Math.max(0, Math.min(10, Number(row["Tolerance Allowed (%)"]))) : undefined,
          pin: String(row["PIN"] || "").trim() || undefined,
          salesPerson: String(row["Sales Person"] || "").trim() || undefined,
          gstType: String(row["GST Type"] || "").trim() || undefined,
          panNo: String(row["PAN No"] || "").trim() || undefined,
          paymentTerms: String(row["PAYMENT TERMS"] || "").trim() || undefined,
          openingBalance: row["OPENING BALANCE"] ? Number(row["OPENING BALANCE"]) : undefined,
          overdues: row["OVERDUES"] ? Number(row["OVERDUES"]) : undefined,
          target: row["TARGET"] ? Number(row["TARGET"]) : undefined,
          reffPerson: String(row["REFF. PERSON"] || "").trim() || undefined,
          priority: String(row["Priority"] || "").trim() || undefined,
          followupFrequency: String(row["Followup Frequency"] || "").trim() || undefined,
          autoEmail: String(row["Auto Email"] || "").trim() || undefined,
          followupApproval: String(row["Followup Approval"] || "").trim() || undefined,
          active: (String(row["Active"] || "Yes").trim().toLowerCase() === "no" ? "No" : "Yes") as Company["active"],
          ...audit,
        })).filter(c => c.name);

        if (newCompanies.length === 0) {
          alert("No valid companies found in the file. Ensure 'Company Name' column is filled.");
          setIsSubmitting(false);
          return;
        }

        const existingNames = new Set(companies.map(c => c.name.toLowerCase()));
        const uniqueNewCompanies = newCompanies.filter(c => !existingNames.has(c.name.toLowerCase()));
        
        const skippedCount = newCompanies.length - uniqueNewCompanies.length;

        if (uniqueNewCompanies.length > 0) {
          await setCompanies([...companies, ...uniqueNewCompanies]);
          alert(`Successfully uploaded ${uniqueNewCompanies.length} companies.${skippedCount > 0 ? ` Skipped ${skippedCount} duplicates.` : ""}`);
        } else {
          alert("All companies in the file already exist.");
        }
      } catch (error) {
        console.error("Bulk upload error:", error);
        alert("Failed to parse or upload the Excel file.");
      } finally {
        setIsSubmitting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const exportToExcel = () => {
    const dataToExport = sortedCompanies.map(c => ({
      "Company Name": c.name,
      "Contact Person": c.contactPerson || "",
      "Contact Number": c.contactNumber || "",
      "Email Id": c.email || "",
      "Address": c.address || "",
      "District": c.district || "",
      "State": c.state || "",
      "GST NO": c.gstNo || "",
      "GST Supply Type": c.gstSupplyType || "INTRA_STATE",
      "Deviation Allowed (%)": c.deviationAllowed ?? "",
      "Tolerance Allowed (%)": c.toleranceAllowed ?? "",
      "PIN": c.pin || "",
      "Sales Person": c.salesPerson || "",
      "GST Type": c.gstType || "",
      "PAN No": c.panNo || "",
      "PAYMENT TERMS": c.paymentTerms || "",
      "OPENING BALANCE": c.openingBalance ?? "",
      "OVERDUES": c.overdues ?? "",
      "TARGET": c.target ?? "",
      "REFF. PERSON": c.reffPerson || "",
      "Priority": c.priority || "",
      "Followup Frequency": c.followupFrequency || "",
      "Auto Email": c.autoEmail || "",
      "Followup Approval": c.followupApproval || "",
      "Active": c.active === "No" ? "No" : "Yes"
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Companies");
    XLSX.writeFile(wb, "Companies_Master_Export.xlsx");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isMandatoryField("company_form", "gstSupplyType") && !gstSupplyType) {
      alert("GST Supply Type is mandatory.");
      return;
    }

    const isDuplicate = companies.some(
      (c) => c.name.toLowerCase() === name.trim().toLowerCase() && c.id !== editingId
    );
    if (isDuplicate) {
      alert("A company with this name already exists.");
      return;
    }

    setIsSubmitting(true);
    try {
      const audit = { updatedBy: "System User", updateTimestamp: new Date().toISOString() } as Partial<Company>;
      const payload: Company = {
        id: editingId || crypto.randomUUID(),
        name: name.trim(),
        contactPerson: contactPerson.trim() || undefined,
        contactNumber: contactNumber.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        district: district.trim() || undefined,
        state: stateField.trim() || undefined,
        gstNo: gstNo.trim() || undefined,
        gstSupplyType: gstSupplyType || undefined,
        deviationAllowed: deviationAllowed === "" ? undefined : Number(deviationAllowed),
        toleranceAllowed: toleranceAllowed === "" ? undefined : Number(toleranceAllowed),
        pin: pin.trim() || undefined,
        salesPerson: salesPerson.trim() || undefined,
        gstType: gstType.trim() || undefined,
        panNo: panNo.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        openingBalance: openingBalance === "" ? undefined : Number(openingBalance),
        overdues: overdues === "" ? undefined : Number(overdues),
        target: target === "" ? undefined : Number(target),
        reffPerson: reffPerson.trim() || undefined,
        priority: priority.trim() || undefined,
        followupFrequency: followupFrequency.trim() || undefined,
        autoEmail: autoEmail.trim() || undefined,
        followupApproval: followupApproval.trim() || undefined,
        active,
        ...audit,
      };

      if (editingId) {
        await setCompanies(companies.map((c) => (c.id === editingId ? { ...c, ...payload } : c)));
      } else {
        await setCompanies([...companies, payload]);
      }

      resetForm();
      setIsFormOpen(false);
    } catch (err) {
      console.error("Failed to save company:", err);
      alert("Failed to save company. Please check the console for details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    try {
      await setCompanies(companies.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete company:", err);
      alert("Failed to delete company.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (company: Company) => {
    setName(company.name || "");
    setContactPerson(company.contactPerson || "");
    setContactNumber(company.contactNumber || "");
    setEmail(company.email || "");
    setAddress(company.address || "");
    setDistrict(company.district || "");
    setStateField(company.state || "");
    setGstNo(company.gstNo || "");
    setGstSupplyType((company.gstSupplyType as any) || "INTRA_STATE");
    setDeviationAllowed(company.deviationAllowed ?? "");
    setToleranceAllowed(company.toleranceAllowed ?? "");
    setPin(company.pin || "");
    setSalesPerson(company.salesPerson || "");
    setGstType(company.gstType || "");
    setPanNo(company.panNo || "");
    setPaymentTerms(company.paymentTerms || "");
    setOpeningBalance(company.openingBalance ?? "");
    setOverdues(company.overdues ?? "");
    setTarget(company.target ?? "");
    setReffPerson(company.reffPerson || "");
    setPriority(company.priority || "");
    setFollowupFrequency(company.followupFrequency || "");
    setAutoEmail(company.autoEmail || "");
    setFollowupApproval(company.followupApproval || "");
    setActive(company.active === "No" ? "No" : "Yes");
    setEditingId(company.id);
    setIsFormOpen(true);
  };

  const sortedCompanies = useMemo(() => [...companies].sort((a, b) => {
    const timeA = a.updateTimestamp ? new Date(a.updateTimestamp).getTime() : 0;
    const timeB = b.updateTimestamp ? new Date(b.updateTimestamp).getTime() : 0;
    return timeB - timeA || (a.name || "").localeCompare(b.name || "");
  }), [companies]);
  const [searchTerm, setSearchTerm] = useState("");
  const [salesFilter, setSalesFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [supplyFilter, setSupplyFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const companyFilterOptions = useMemo(() => ({
    sales: toFilterOptions(companies.map((c) => c.salesPerson)),
    states: toFilterOptions(companies.map((c) => c.state)),
    supply: toFilterOptions(companies.map((c) => c.gstSupplyType || "INTRA_STATE")),
  }), [companies]);
  const narrowedCompanies = useMemo(() => sortedCompanies.filter((c) =>
    (!salesFilter || String(c.salesPerson || "").trim() === salesFilter) &&
    (!stateFilter || String(c.state || "").trim() === stateFilter) &&
    (!supplyFilter || (c.gstSupplyType || "INTRA_STATE") === supplyFilter) &&
    (!activeFilter || (c.active === "No" ? "No" : "Yes") === activeFilter)
  ), [sortedCompanies, salesFilter, stateFilter, supplyFilter, activeFilter]);
  const hasCompanyFilters = Boolean(searchTerm.trim() || salesFilter || stateFilter || supplyFilter || activeFilter);
  const clearCompanyFilters = () => { setSearchTerm(""); setSalesFilter(""); setStateFilter(""); setSupplyFilter(""); setActiveFilter(""); };
  const openCreateCompany = () => { resetForm(); setEditingId(null); setIsFormOpen(true); };

  const filteredCompanies = useTableSearch(narrowedCompanies, searchTerm, (c) => [
    c.name,
    c.contactPerson,
    c.contactNumber,
    c.email,
    c.address,
    c.district,
    c.state,
    c.pin,
    c.gstNo,
    c.gstType,
    c.gstSupplyType || "INTRA_STATE",
    c.panNo,
    c.salesPerson,
    c.paymentTerms,
    c.openingBalance,
    c.overdues,
    c.target,
    c.reffPerson,
    c.priority,
    c.followupFrequency,
    c.autoEmail,
    c.followupApproval,
    c.deviationAllowed,
    c.toleranceAllowed,
    c.active === "No" ? "No" : "Yes",
  ]);
  const { sorted: sortedFilteredCompanies, sort, toggle: toggleSort } = useTableSort(filteredCompanies, (c, key) => {
    switch (key) {
      case "gstSupplyType": return c.gstSupplyType || "INTRA_STATE";
      case "active": return c.active === "No" ? "No" : "Yes";
      default: return (c as any)[key];
    }
  });

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedCompanies,
  } = useClientPagination(sortedFilteredCompanies, 25);

  return (
    <div className="space-y-4">
      {isFormOpen ? (
        <h2 className="text-center text-xl font-bold uppercase tracking-tight text-black">{editingId ? "Edit Company" : "New Company"}</h2>
      ) : (
        <MasterHeader title="Companies Master" addLabel="Add Company" onAdd={openCreateCompany} />
      )}

      {isFormOpen && (
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl space-y-4 rounded-lg border-2 border-black bg-white p-4">
          <MandatoryLegend />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col space-y-1">
              <MandatoryLabel label="Company Name" required className="font-bold text-black" />
              <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Contact Person</label>
              <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Contact Number</label>
              <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Email Id</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1 md:col-span-2">
              <label className="font-bold text-black">Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">District</label>
              <input value={district} onChange={(e) => setDistrict(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">State</label>
              <input value={stateField} onChange={(e) => setStateField(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1 md:col-span-2">
              <label className="font-bold text-black">GST NO</label>
              <input value={gstNo} onChange={(e) => setGstNo(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1 md:col-span-2">
              <MandatoryLabel label="GST Supply Type" required={isMandatoryField("company_form", "gstSupplyType")} className="font-bold text-black" />
              <select
                value={gstSupplyType}
                onChange={(e) => setGstSupplyType(e.target.value as "" | "INTRA_STATE" | "INTER_STATE")}
                required={isMandatoryField("company_form", "gstSupplyType")}
                className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
              >
                <option value="" disabled>
                  Select GST Supply Type...
                </option>
                <option value="INTRA_STATE">INTRA_STATE (CGST+SGST)</option>
                <option value="INTER_STATE">INTER_STATE (IGST)</option>
              </select>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">PIN</label>
              <input value={pin} onChange={(e) => setPin(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Sales Person</label>
              <input value={salesPerson} onChange={(e) => setSalesPerson(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">GST Type</label>
              <input value={gstType} onChange={(e) => setGstType(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">PAN No</label>
              <input value={panNo} onChange={(e) => setPanNo(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">PAYMENT TERMS</label>
              <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">OPENING BALANCE</label>
              <input type="number" step="any" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value === "" ? "" : Number(e.target.value))} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">OVERDUES</label>
              <input type="number" step="any" value={overdues} onChange={(e) => setOverdues(e.target.value === "" ? "" : Number(e.target.value))} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">TARGET</label>
              <input type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value === "" ? "" : Number(e.target.value))} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">REFF. PERSON</label>
              <input value={reffPerson} onChange={(e) => setReffPerson(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Priority</label>
              <input value={priority} onChange={(e) => setPriority(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Followup Frequency</label>
              <input value={followupFrequency} onChange={(e) => setFollowupFrequency(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Auto Email</label>
              <input value={autoEmail} onChange={(e) => setAutoEmail(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Followup Approval</label>
              <input value={followupApproval} onChange={(e) => setFollowupApproval(e.target.value)} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors" />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Active</label>
              <select value={active} onChange={(e) => setActive(e.target.value === "No" ? "No" : "Yes")} className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors">
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Deviation Allowed (%)</label>
              <input
                type="number"
                min={0}
                step="any"
                value={deviationAllowed}
                onChange={(e) => setDeviationAllowed(e.target.value === "" ? "" : parseFloat(e.target.value))}
                className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
              />
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Tolerance Allowed (%)</label>
              <input
                type="number"
                min={0}
                max={10}
                step="any"
                value={toleranceAllowed}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  if (rawValue === "") {
                    setToleranceAllowed("");
                    return;
                  }
                  const numericValue = Math.max(0, Math.min(10, parseFloat(rawValue)));
                  setToleranceAllowed(numericValue);
                }}
                className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <button type="submit" disabled={isSubmitting} className="flex items-center justify-center min-w-[100px] bg-emerald-600 text-white px-6 py-2 rounded font-bold hover:bg-emerald-700 transition disabled:opacity-50">
              {isSubmitting ? <Spinner size={20} className="text-white" /> : "Save"}
            </button>
            <button type="button" onClick={() => { setIsFormOpen(false); resetForm(); }} disabled={isSubmitting} className="bg-white text-black border-2 border-black px-6 py-2 rounded font-bold hover:bg-slate-100 transition disabled:opacity-50">Cancel</button>
          </div>
        </form>
      )}

      {!isFormOpen ? (<>
      <ReportFilterBox search={searchTerm} onSearch={setSearchTerm} hasFilters={hasCompanyFilters} onClear={clearCompanyFilters}>
        <SelectFilter label="Sales Person" value={salesFilter} onChange={setSalesFilter} options={companyFilterOptions.sales} />
        <SelectFilter label="State" value={stateFilter} onChange={setStateFilter} options={companyFilterOptions.states} />
        <SelectFilter label="GST Supply Type" value={supplyFilter} onChange={setSupplyFilter} options={companyFilterOptions.supply} />
        <SelectFilter label="Active" value={activeFilter} onChange={setActiveFilter} options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]} />
      </ReportFilterBox>

      <div className="text-xs font-bold text-slate-700">{filteredCompanies.length.toLocaleString()} {filteredCompanies.length === 1 ? "company" : "companies"}</div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-black">
        <div className="block md:hidden space-y-4 p-4">
          {paginatedCompanies.map((c, index) => (
            <div
              key={c.id}
              onClick={canManage ? () => handleEdit(c) : undefined}
              className={`${canManage ? "cursor-pointer" : ""} bg-white border-2 border-black p-4 space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs font-black uppercase text-slate-500">SL No: {(page - 1) * pageSize + index + 1}</div>
                  <div className="text-sm font-bold">{c.name}</div>
                  <div className="text-xs text-slate-700">{c.contactPerson} {c.contactNumber ? `| ${c.contactNumber}` : ""}</div>
                  <div className="text-xs text-slate-700">{c.email}</div>
                  <div className="text-xs text-slate-700">{c.district} {c.state ? `| ${c.state}` : ""} {c.pin ? `| ${c.pin}` : ""}</div>
                  <div className="text-xs text-slate-700">GST Supply Type: {c.gstSupplyType || "INTRA_STATE"} {c.gstType ? `| Type: ${c.gstType}` : ""}</div>
                  <div className="text-xs text-slate-700">PAN: {c.panNo || "-"} | Sales Person: {c.salesPerson || "-"}</div>
                  <div className="text-xs text-slate-700">Terms: {c.paymentTerms || "-"} | Priority: {c.priority || "-"}</div>
                  <div className="text-xs text-slate-700">Opening: {c.openingBalance ?? "-"} | Overdues: {c.overdues ?? "-"} | Target: {c.target ?? "-"}</div>
                  <div className="text-xs text-slate-700">Followup: {c.followupFrequency || "-"} | Auto Email: {c.autoEmail || "-"} | Approval: {c.followupApproval || "-"}</div>
                  <div className="text-xs text-slate-700">REFF. PERSON: {c.reffPerson || "-"}</div>
                  <div className="text-xs font-bold text-slate-700">Active: {c.active === "No" ? "No" : "Yes"}</div>
                  <div className="text-xs text-slate-700">Deviation Allowed: {c.deviationAllowed ?? "-"}%</div>
                  <div className="text-xs text-slate-700">Tolerance Allowed: {c.toleranceAllowed ?? "-"}%</div>
                </div>
                <div className="flex items-center gap-2">
                  {canManage ? <button onClick={(event) => { event.stopPropagation(); handleEdit(c); }} disabled={isSubmitting} className="text-indigo-600 hover:text-indigo-900 flex items-center disabled:opacity-50 font-bold"><Edit size={16} /></button> : null}
                  {canManage ? <button onClick={(event) => { event.stopPropagation(); handleDelete(c.id); }} className={`${deletingId === c.id ? "text-amber-600 animate-pulse" : "text-red-600"} hover:text-red-900 font-bold flex items-center`}><Trash2 size={16} /></button> : null}
                </div>
              </div>
              {c.address && <div className="text-xs text-slate-700">{c.address}</div>}
            </div>
          ))}
        </div>

        <div className="table-sticky-scroll hidden md:block">
          <table className="min-w-max divide-y divide-black border-collapse border border-black">
            <thead className="bg-slate-100 divide-x divide-black sticky top-0 z-10">
              <tr className="divide-x divide-black">
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black">SL No</th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Company" sortKey="name" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Contact Person" sortKey="contactPerson" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Contact Number" sortKey="contactNumber" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Email Id" sortKey="email" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Address" sortKey="address" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="District" sortKey="district" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="State" sortKey="state" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="PIN" sortKey="pin" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black"><SortHeader label="GST NO" sortKey="gstNo" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="GST Type" sortKey="gstType" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="GST Supply Type" sortKey="gstSupplyType" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="PAN No" sortKey="panNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Sales Person" sortKey="salesPerson" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="PAYMENT TERMS" sortKey="paymentTerms" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black"><SortHeader label="OPENING BALANCE" sortKey="openingBalance" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black"><SortHeader label="OVERDUES" sortKey="overdues" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black"><SortHeader label="TARGET" sortKey="target" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="REFF. PERSON" sortKey="reffPerson" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Priority" sortKey="priority" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Followup Frequency" sortKey="followupFrequency" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Auto Email" sortKey="autoEmail" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Followup Approval" sortKey="followupApproval" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black"><SortHeader label="Deviation Allowed" sortKey="deviationAllowed" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black"><SortHeader label="Tolerance Allowed" sortKey="toleranceAllowed" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Active" sortKey="active" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black bg-white">
              {filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={27} className="px-6 py-8 text-center text-black font-medium tracking-wide">
                    {isLoading ? <div className="flex justify-center"><Spinner /></div> : 'No companies found.'}
                  </td>
                </tr>
              ) : (
                paginatedCompanies.map((c, index) => (
                  <tr
                    key={c.id}
                    onClick={canManage ? () => handleEdit(c) : undefined}
                    className={`${canManage ? "cursor-pointer" : ""} hover:bg-slate-50 transition-colors divide-x divide-black`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-black text-right border border-black">{(page - 1) * pageSize + index + 1}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.contactPerson}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.contactNumber}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.address}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.district}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.state}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.pin}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black text-right border border-black">{c.gstNo}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.gstType}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.gstSupplyType || "INTRA_STATE"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.panNo}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.salesPerson}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.paymentTerms}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black text-right border border-black">{c.openingBalance ?? "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black text-right border border-black">{c.overdues ?? "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black text-right border border-black">{c.target ?? "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.reffPerson}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.priority}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.followupFrequency}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.autoEmail}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black border border-black">{c.followupApproval}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black text-right border border-black">{c.deviationAllowed ?? "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-black text-right border border-black">{c.toleranceAllowed ?? "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-black border border-black">{c.active === "No" ? "No" : "Yes"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium border border-black">
                        {canManage ? <button
                        title="Edit"
                        aria-label="Edit"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleEdit(c);
                        }}
                        disabled={isSubmitting}
                        className="text-indigo-600 hover:text-indigo-900 mr-4 disabled:opacity-50"
                      >
                        <Edit size={16} />
                        </button> : null}
                        {canManage ? <button
                        title={deletingId === c.id ? "Confirm delete" : "Delete"}
                        aria-label={deletingId === c.id ? "Confirm delete" : "Delete"}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(c.id);
                        }}
                        className={`${deletingId === c.id ? "text-amber-600 animate-pulse" : "text-red-600"} hover:text-red-900 inline-flex items-center justify-end`}
                      >
                        <Trash2 size={16} />
                        </button> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ClientPagination
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
      </>) : null}
    </div>
  );
}
