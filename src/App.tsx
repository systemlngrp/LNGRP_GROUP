/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./auth/RequireAuth";
import { LoginPage } from "./pages/Login";
import { UnauthorizedPage } from "./pages/Unauthorized";
const ItemGroups = lazy(() => import("./pages/ItemGroups").then((module) => ({ default: module.ItemGroups })));
const MaterialGroups = lazy(() => import("./pages/MaterialGroups").then((module) => ({ default: module.MaterialGroups })));
const LegacyItemsMaster = lazy(() => import("./pages/LegacyItemsMaster").then((module) => ({ default: module.LegacyItemsMaster })));
const Materials = lazy(() => import("./pages/Materials").then((module) => ({ default: module.Materials })));
const IndentForm = lazy(() => import("./pages/IndentForm").then((module) => ({ default: module.IndentForm })));
const IndentDetail = lazy(() => import("./pages/IndentDetail").then((module) => ({ default: module.IndentDetail })));
const IndentApproved = lazy(() => import("./pages/IndentQueue").then((module) => ({ default: module.IndentApproved })));
const IndentCompleted = lazy(() => import("./pages/IndentQueue").then((module) => ({ default: module.IndentCompleted })));
const IndentPending = lazy(() => import("./pages/IndentQueue").then((module) => ({ default: module.IndentPending })));
const IndentRejected = lazy(() => import("./pages/IndentQueue").then((module) => ({ default: module.IndentRejected })));
const PurchaseOrderPendingIndentLines = lazy(() => import("./pages/PurchaseOrderPendingIndentLines").then((module) => ({ default: module.PurchaseOrderPendingIndentLines })));
const PurchaseOrderCreate = lazy(() => import("./pages/PurchaseOrderCreate").then((module) => ({ default: module.PurchaseOrderCreate })));
const PurchaseOrderAll = lazy(() => import("./pages/PurchaseOrderList").then((module) => ({ default: module.PurchaseOrderAll })));
const PurchaseOrderApproved = lazy(() => import("./pages/PurchaseOrderList").then((module) => ({ default: module.PurchaseOrderApproved })));
const PurchaseOrderItemCancelled = lazy(() => import("./pages/PurchaseOrderList").then((module) => ({ default: module.PurchaseOrderItemCancelled })));
const PurchaseOrderItemNotReceived = lazy(() => import("./pages/PurchaseOrderList").then((module) => ({ default: module.PurchaseOrderItemNotReceived })));
const PurchaseOrderPendingApproval = lazy(() => import("./pages/PurchaseOrderList").then((module) => ({ default: module.PurchaseOrderPendingApproval })));
const PurchaseOrderRejected = lazy(() => import("./pages/PurchaseOrderList").then((module) => ({ default: module.PurchaseOrderRejected })));
const GateEntryForm = lazy(() => import("./pages/GateEntryForm").then((module) => ({ default: module.GateEntryForm })));
const CancelledGateEntry = lazy(() => import("./pages/GateEntryMaster").then((module) => ({ default: module.CancelledGateEntry })));
const GateEntryMaster = lazy(() => import("./pages/GateEntryMaster").then((module) => ({ default: module.GateEntryMaster })));
const PendingMrr = lazy(() => import("./pages/PendingMrr").then((module) => ({ default: module.PendingMrr })));
const PendingTallyEntry = lazy(() => import("./pages/PendingTallyEntry").then((module) => ({ default: module.PendingTallyEntry })));
const PendingDebitNote = lazy(() => import("./pages/PendingDebitNote").then((module) => ({ default: module.PendingDebitNote })));
const PendingCreditNote = lazy(() => import("./pages/PendingCreditNote").then((module) => ({ default: module.PendingCreditNote })));
const PendingPHApproval = lazy(() => import("./pages/PendingPHApproval").then((module) => ({ default: module.PendingPHApproval })));
const PendingAccountsApproval = lazy(() => import("./pages/PendingAccountsApproval").then((module) => ({ default: module.PendingAccountsApproval })));
const PendingMDApproval = lazy(() => import("./pages/PendingMDApproval").then((module) => ({ default: module.PendingMDApproval })));
const MaterialIssueForm = lazy(() => import("./pages/MaterialIssueForm").then((module) => ({ default: module.MaterialIssueForm })));
const MaterialReturnForm = lazy(() => import("./pages/MaterialReturnForm").then((module) => ({ default: module.MaterialReturnForm })));
const ReelReturnForm = lazy(() => import("./pages/ReelReturnForm").then((module) => ({ default: module.ReelReturnForm })));
const PendingMaterialReturn = lazy(() => import("./pages/PendingMaterialReturn").then((module) => ({ default: module.PendingMaterialReturn })));
const PendingJobTransfer = lazy(() => import("./pages/PendingJobTransfer").then((module) => ({ default: module.PendingJobTransfer })));
const ReelTransferForm = lazy(() => import("./pages/ReelTransferForm").then((module) => ({ default: module.ReelTransferForm })));
const MaterialIssueMaster = lazy(() => import("./pages/MaterialIssueMaster").then((module) => ({ default: module.MaterialIssueMaster })));
const MaterialReturnMaster = lazy(() => import("./pages/MaterialReturnMaster").then((module) => ({ default: module.MaterialReturnMaster })));
const PendingNonJobMaterialIssue = lazy(() => import("./pages/PendingNonJobMaterialIssue").then((module) => ({ default: module.PendingNonJobMaterialIssue })));
const NonJobIssueMaster = lazy(() => import("./pages/NonJobIssueMaster").then((module) => ({ default: module.NonJobIssueMaster })));
const PendingConsumptionTallyPosting = lazy(() => import("./pages/PendingConsumptionTallyPosting").then((module) => ({ default: module.PendingConsumptionTallyPosting })));
const ReelIssueReturnForm = lazy(() => import("./pages/ReelIssueReturnForm").then((module) => ({ default: module.ReelIssueReturnForm })));
const ReelIssueReturnScan = lazy(() => import("./pages/ReelIssueReturnScan").then((module) => ({ default: module.ReelIssueReturnScan })));
const DailyConsumptionIssueForm = lazy(() => import("./pages/DailyConsumptionIssueForm").then((module) => ({ default: module.DailyConsumptionIssueForm })));
const DailyConsumptionMaster = lazy(() => import("./pages/DailyConsumptionMaster").then((module) => ({ default: module.DailyConsumptionMaster })));
const Suppliers = lazy(() => import("./pages/Suppliers").then((module) => ({ default: module.Suppliers })));
const States = lazy(() => import("./pages/States").then((module) => ({ default: module.States })));
const Units = lazy(() => import("./pages/Units").then((module) => ({ default: module.Units })));
const ColorMasters = lazy(() => import("./pages/ColorMasters").then((module) => ({ default: module.ColorMasters })));
const GstRateMasters = lazy(() => import("./pages/GstRateMasters").then((module) => ({ default: module.GstRateMasters })));
const ExpenseMasters = lazy(() => import("./pages/ExpenseMasters").then((module) => ({ default: module.ExpenseMasters })));
const Companies = lazy(() => import("./pages/Companies").then((module) => ({ default: module.Companies })));
const Trucks = lazy(() => import("./pages/Trucks").then((module) => ({ default: module.Trucks })));
const Machines = lazy(() => import("./pages/Machines").then((module) => ({ default: module.Machines })));
const RapcRangeMaster = lazy(() => import("./pages/RapcRangeMaster").then((module) => ({ default: module.RapcRangeMaster })));
const NpdMaster = lazy(() => import("./pages/NpdMaster").then((module) => ({ default: module.NpdMaster })));
const NewSpec = lazy(() => import("./pages/NewSpec").then((module) => ({ default: module.NewSpec })));
const PhpItemMaster = lazy(() => import("./pages/PhpItemMaster").then((module) => ({ default: module.PhpItemMaster })));
const PlateItemMaster = lazy(() => import("./pages/PlateItemMaster").then((module) => ({ default: module.PlateItemMaster })));
const PhpPlateInOut = lazy(() => import("./pages/PhpPlateInOut").then((module) => ({ default: module.PhpPlateInOut })));
const QcPhpPlateInOutForm = lazy(() => import("./pages/QcPhpPlateInOut").then((module) => ({ default: module.QcPhpPlateInOutForm })));
const QcPhpPlateInOutMaster = lazy(() => import("./pages/QcPhpPlateInOut").then((module) => ({ default: module.QcPhpPlateInOutMaster })));
const CoaForm = lazy(() => import("./pages/CoaForm").then((module) => ({ default: module.CoaForm })));
const CoaMaster = lazy(() => import("./pages/CoaMaster").then((module) => ({ default: module.CoaMaster })));
const CoaTemplateMaster = lazy(() => import("./pages/CoaTemplateMaster").then((module) => ({ default: module.CoaTemplateMaster })));
const MaterialInForm = lazy(() => import("./pages/MaterialInForm").then((module) => ({ default: module.MaterialInForm })));
const MrrApprovals = lazy(() => import("./pages/MrrApprovals").then((module) => ({ default: module.MrrApprovals })));
const MaterialInMaster = lazy(() => import("./pages/MaterialInMaster").then((module) => ({ default: module.MaterialInMaster })));
const MaterialInItemMaster = lazy(() => import("./pages/MaterialInItemMaster").then((module) => ({ default: module.MaterialInItemMaster })));
const ProductionForm = lazy(() => import("./pages/ProductionForm").then((module) => ({ default: module.ProductionForm })));
const PendingProduction = lazy(() => import("./pages/PendingProduction").then((module) => ({ default: module.PendingProduction })));
const ProductionPendingTally = lazy(() => import("./pages/ProductionPendingTally").then((module) => ({ default: module.ProductionPendingTally })));
const ProductionMaster = lazy(() => import("./pages/ProductionMaster").then((module) => ({ default: module.ProductionMaster })));
const PhpProductionMaster = lazy(() => import("./pages/PhpProductionMaster").then((module) => ({ default: module.PhpProductionMaster })));
const PhpProductionScheduling = lazy(() => import("./pages/PhpProductionScheduling").then((module) => ({ default: module.PhpProductionScheduling })));
const PhpProductionExecution = lazy(() => import("./pages/PhpProductionExecution").then((module) => ({ default: module.PhpProductionExecution })));
const PhpPlateProductionScheduling = lazy(() => import("./pages/PhpPlateProductionScheduling").then((module) => ({ default: module.PhpPlateProductionScheduling })));
const PhpPlateProductionExecution = lazy(() => import("./pages/PhpPlateProductionExecution").then((module) => ({ default: module.PhpPlateProductionExecution })));
const PhpPlateProductionSequencing = lazy(() => import("./pages/PhpPlateProductionSequencing").then((module) => ({ default: module.PhpPlateProductionSequencing })));
const PlateProductionMaster = lazy(() => import("./pages/PlateProductionMaster").then((module) => ({ default: module.PlateProductionMaster })));
const PlateProductionScheduling = lazy(() => import("./pages/PlateProductionScheduling").then((module) => ({ default: module.PlateProductionScheduling })));
const PlateProductionExecution = lazy(() => import("./pages/PlateProductionExecution").then((module) => ({ default: module.PlateProductionExecution })));
const ProductionPendingConsumption = lazy(() => import("./pages/ProductionStageQueue").then((module) => ({ default: module.ProductionPendingConsumption })));
const ProductionPendingReelIssueScan = lazy(() => import("./pages/ProductionStageQueue").then((module) => ({ default: module.ProductionPendingReelIssueScan })));
const ProductionPlan = lazy(() => import("./pages/ProductionPlan").then((module) => ({ default: module.ProductionPlan })));
const PendingNpd = lazy(() => import("./pages/PendingNpd").then((module) => ({ default: module.PendingNpd })));
const OperationDashboard = lazy(() => import("./pages/OperationDashboard").then((module) => ({ default: module.OperationDashboard })));
const AuditDashboard = lazy(() => import("./pages/AuditDashboard").then((module) => ({ default: module.AuditDashboard })));
const PendingJobClosure = lazy(() => import("./pages/PendingJobClosure").then((module) => ({ default: module.PendingJobClosure })));
const MachinePendingProcessing = lazy(() => import("./pages/MachinePendingProcessing").then((module) => ({ default: module.MachinePendingProcessing })));
const PendingPrinting = lazy(() => import("./pages/MachinePendingProcessing").then((module) => ({ default: module.PendingPrinting })));
const ProductionProcessingForm = lazy(() => import("./pages/ProductionProcessingForm").then((module) => ({ default: module.ProductionProcessingForm })));
const ProductionProcessingMaster = lazy(() => import("./pages/ProductionProcessingMaster").then((module) => ({ default: module.ProductionProcessingMaster })));
const ManufacturingJournal = lazy(() => import("./pages/ManufacturingJournal").then((module) => ({ default: module.ManufacturingJournal })));
const ItemwiseLeastCost = lazy(() => import("./pages/ItemwiseLeastCost").then((module) => ({ default: module.ItemwiseLeastCost })));
const CanceledProductions = lazy(() => import("./pages/CanceledProductions").then((module) => ({ default: module.CanceledProductions })));
const SampleForm = lazy(() => import("./pages/SampleForm").then((module) => ({ default: module.SampleForm })));
const PendingSamples = lazy(() => import("./pages/PendingSamples").then((module) => ({ default: module.PendingSamples })));
const SamplesProduced = lazy(() => import("./pages/SamplesProduced").then((module) => ({ default: module.SamplesProduced })));
const SampleMaster = lazy(() => import("./pages/SampleMaster").then((module) => ({ default: module.SampleMaster })));
const BoardLineQcForm = lazy(() => import("./pages/BoardLineQc").then((module) => ({ default: module.BoardLineQcForm })));
const BoardLineQcMaster = lazy(() => import("./pages/BoardLineQc").then((module) => ({ default: module.BoardLineQcMaster })));
const PrintingQcForm = lazy(() => import("./pages/PrintingQc").then((module) => ({ default: module.PrintingQcForm })));
const PrintingQcMaster = lazy(() => import("./pages/PrintingQc").then((module) => ({ default: module.PrintingQcMaster })));
const QcMasterData = lazy(() => import("./pages/QcMasterData").then((module) => ({ default: module.QcMasterData })));
const QcUpdateForm = lazy(() => import("./pages/QcUpdateForm").then((module) => ({ default: module.QcUpdateForm })));
const QcUpdateMaster = lazy(() => import("./pages/QcUpdateMaster").then((module) => ({ default: module.QcUpdateMaster })));
const QcFileNoMaster = lazy(() => import("./pages/QcFileNoMaster").then((module) => ({ default: module.QcFileNoMaster })));
const SpecialRemarkForm = lazy(() => import("./pages/SpecialRemarks").then((module) => ({ default: module.SpecialRemarkForm })));
const SpecialRemarkMaster = lazy(() => import("./pages/SpecialRemarks").then((module) => ({ default: module.SpecialRemarkMaster })));
const PrintingStereoMaster = lazy(() => import("./pages/PrintingStereo").then((module) => ({ default: module.PrintingStereoMaster })));
const QcBlockRecordForm = lazy(() => import("./pages/QcBlockRecordForm").then((module) => ({ default: module.QcBlockRecordForm })));
const QcPrintingWastageForm = lazy(() => import("./pages/QcPrintingWastage").then((module) => ({ default: module.QcPrintingWastageForm })));
const QcPrintingWastageMaster = lazy(() => import("./pages/QcPrintingWastage").then((module) => ({ default: module.QcPrintingWastageMaster })));
const Users = lazy(() => import("./pages/Users").then((module) => ({ default: module.Users })));
const Services = lazy(() => import("./pages/Services").then((module) => ({ default: module.Services })));
const WhatsappMaster = lazy(() => import("./pages/WhatsappMaster").then((module) => ({ default: module.WhatsappMaster })));
const PlantHeadUnified = lazy(() => import("./pages/PlantHeadUnified").then((module) => ({ default: module.PlantHeadUnified })));
const OrderForm = lazy(() => import("./pages/OrderForm").then((module) => ({ default: module.OrderForm })));
const OrdersPendingPH = lazy(() => import("./pages/OrdersPendingPH").then((module) => ({ default: module.OrdersPendingPH })));
const OrdersPendingScheduling = lazy(() => import("./pages/OrdersPendingScheduling").then((module) => ({ default: module.OrdersPendingScheduling })));
const OrdersMaster = lazy(() => import("./pages/OrdersMaster").then((module) => ({ default: module.OrdersMaster })));
const PendingScheduledOrders = lazy(() => import("./pages/ScheduledOrdersMaster").then((module) => ({ default: module.PendingScheduledOrders })));
const ScheduledOrdersMaster = lazy(() => import("./pages/ScheduledOrdersMaster").then((module) => ({ default: module.ScheduledOrdersMaster })));
const UpcomingScheduledOrders = lazy(() => import("./pages/UpcomingScheduledOrders").then((module) => ({ default: module.UpcomingScheduledOrders })));
const PendingDispatchPlanning = lazy(() => import("./pages/PendingDispatchPlanning").then((module) => ({ default: module.PendingDispatchPlanning })));
const PendingPhpPlanning = lazy(() => import("./pages/PendingLinkedProductionPlanning").then((module) => ({ default: module.PendingPhpPlanning })));
const PendingPlatePlanning = lazy(() => import("./pages/PendingLinkedProductionPlanning").then((module) => ({ default: module.PendingPlatePlanning })));
const DispatchPlansMaster = lazy(() => import("./pages/DispatchPlansMaster").then((module) => ({ default: module.DispatchPlansMaster })));
const PendingLoading = lazy(() => import("./pages/PendingLoading").then((module) => ({ default: module.PendingLoading })));
const LoadingMaster = lazy(() => import("./pages/LoadingMaster").then((module) => ({ default: module.LoadingMaster })));
const PhpLoadingMaster = lazy(() => import("./pages/PhpLoadingMaster").then((module) => ({ default: module.PhpLoadingMaster })));
const PlateLoadingMaster = lazy(() => import("./pages/PlateLoadingMaster").then((module) => ({ default: module.PlateLoadingMaster })));
const PendingPhpLoadingTallyPosting = lazy(() => import("./pages/PendingLinkedLoadingTally").then((module) => ({ default: module.PendingPhpLoadingTallyPosting })));
const PendingPlateLoadingTallyPosting = lazy(() => import("./pages/PendingLinkedLoadingTally").then((module) => ({ default: module.PendingPlateLoadingTallyPosting })));
const PendingInvoicing = lazy(() => import("./pages/PendingInvoicing").then((module) => ({ default: module.PendingInvoicing })));
const BillingPendingTally = lazy(() => import("./pages/BillingPendingTally").then((module) => ({ default: module.BillingPendingTally })));
const InvoicesMaster = lazy(() => import("./pages/InvoicesMaster").then((module) => ({ default: module.InvoicesMaster })));
const GatePassForm = lazy(() => import("./pages/GatePassForm").then((module) => ({ default: module.GatePassForm })));
const GatePassMaster = lazy(() => import("./pages/GatePassMaster").then((module) => ({ default: module.GatePassMaster })));
const PendingReturnableItems = lazy(() => import("./pages/PendingReturnableItems").then((module) => ({ default: module.PendingReturnableItems })));
const CanceledOrders = lazy(() => import("./pages/CanceledOrders").then((module) => ({ default: module.CanceledOrders })));
const PlansProductionPlanning = lazy(() => import("./pages/PlansProductionPlanning").then((module) => ({ default: module.PlansProductionPlanning })));
const PlansItems = lazy(() => import("./pages/PlansItems").then((module) => ({ default: module.PlansItems })));
const PlansProduction = lazy(() => import("./pages/PlansProduction").then((module) => ({ default: module.PlansProduction })));
const PlansLoading = lazy(() => import("./pages/PlansLoading").then((module) => ({ default: module.PlansLoading })));
const PlansJobCard = lazy(() => import("./pages/PlansJobCard").then((module) => ({ default: module.PlansJobCard })));
const SettingsPage = lazy(() => import("./pages/Settings").then((module) => ({ default: module.SettingsPage })));
const FirmMaster = lazy(() => import("./pages/FirmMaster").then((module) => ({ default: module.FirmMaster })));
const OtherConsumablesInventoryReport = lazy(() => import("./pages/OtherConsumablesInventoryReport").then((module) => ({ default: module.OtherConsumablesInventoryReport })));
const ErpWiseReelStockReport = lazy(() => import("./pages/ErpWiseReelStockReport").then((module) => ({ default: module.ErpWiseReelStockReport })));
const FGStockReport = lazy(() => import("./pages/FGStockReport").then((module) => ({ default: module.FGStockReport })));
const ReelwiseStockReport = lazy(() => import("./pages/ReelwiseStockReport").then((module) => ({ default: module.ReelwiseStockReport })));
const JobwiseReelConsumptionReport = lazy(() => import("./pages/JobwiseReelConsumptionReport").then((module) => ({ default: module.JobwiseReelConsumptionReport })));
const JobConsumption = lazy(() => import("./pages/JobConsumption").then((module) => ({ default: module.JobConsumption })));
const JobsInProgressReport = lazy(() => import("./pages/JobsInProgressReport").then((module) => ({ default: module.JobsInProgressReport })));
const EfficiencyReport = lazy(() => import("./pages/EfficiencyReport").then((module) => ({ default: module.EfficiencyReport })));
const HitVsMissReport = lazy(() => import("./pages/HitVsMissReport").then((module) => ({ default: module.HitVsMissReport })));
const RealizationReport = lazy(() => import("./pages/RealizationReport").then((module) => ({ default: module.RealizationReport })));
const PaperRequirementReport = lazy(() => import("./pages/PaperRequirementReport").then((module) => ({ default: module.PaperRequirementReport })));
const LmL1Report = lazy(() => import("./pages/LmL1Report").then((module) => ({ default: module.LmL1Report })));
const FixedMonthlyExpenses = lazy(() => import("./pages/FixedMonthlyExpenses").then((module) => ({ default: module.FixedMonthlyExpenses })));
const FixedDailyExpenses = lazy(() => import("./pages/FixedDailyExpenses").then((module) => ({ default: module.FixedDailyExpenses })));
const ConversionCostMonthWiseReport = lazy(() => import("./pages/ConversionCostMonthWiseReport").then((module) => ({ default: module.ConversionCostMonthWiseReport })));
const ConversionCostDetailsReport = lazy(() => import("./pages/ConversionCostDetailsReport").then((module) => ({ default: module.ConversionCostDetailsReport })));
const TruckStatusReport = lazy(() => import("./pages/TruckStatusReport").then((module) => ({ default: module.TruckStatusReport })));
const WastageReport = lazy(() => import("./pages/WastageReport").then((module) => ({ default: module.WastageReport })));
const SummarySheetReport = lazy(() => import("./pages/SummarySheetReport").then((module) => ({ default: module.SummarySheetReport })));
const QcView = lazy(() => import("./pages/QcView").then((module) => ({ default: module.QcView })));
const QcScore = lazy(() => import("./pages/QcScore").then((module) => ({ default: module.QcScore })));
const PdiReport = lazy(() => import("./pages/PdiReportWithComplaints").then((module) => ({ default: module.PdiReportWithComplaints })));
const QualityComplaintForm = lazy(() => import("./pages/QualityComplaintFormUpdated").then((module) => ({ default: module.QualityComplaintFormUpdated })));
const QualityComplaintMaster = lazy(() => import("./pages/QualityComplaintMaster").then((module) => ({ default: module.QualityComplaintMaster })));
const QualityComplaintCapa = lazy(() => import("./pages/QualityComplaintCapa").then((module) => ({ default: module.QualityComplaintCapa })));
const QualityCapaMaster = lazy(() => import("./pages/QualityCapaMaster").then((module) => ({ default: module.QualityCapaMaster })));
const QualityPendingCapa = lazy(() => import("./pages/QualityPendingCapa").then((module) => ({ default: module.QualityPendingCapa })));
const QcSpecCardIssueReturn = lazy(() => import("./pages/QcSpecCardIssueReturn").then((module) => ({ default: module.QcSpecCardIssueReturn })));
const QcSpecCardIssueReturnForm = lazy(() => import("./pages/QcSpecCardIssueReturn").then((module) => ({ default: module.QcSpecCardIssueReturnForm })));
const QcBlockLocationMaster = lazy(() => import("./pages/QcBlockLocationMaster").then((module) => ({ default: module.QcBlockLocationMaster })));
const PreDispatchInspection = lazy(() => import("./pages/PreDispatchInspection").then((module) => ({ default: module.PreDispatchInspection })));
const PreDispatchInspectionForm = lazy(() => import("./pages/PreDispatchInspection").then((module) => ({ default: module.PreDispatchInspectionForm })));
const QcSampleRequirement = lazy(() => import("./pages/QcSampleRequirement").then((module) => ({ default: module.QcSampleRequirement })));
const QcSampleRequirementMaster = lazy(() => import("./pages/QcSampleRequirementMaster").then((module) => ({ default: module.QcSampleRequirementMaster })));
const QcSampleRequirementForm = lazy(() => import("./pages/QcSampleRequirementForm").then((module) => ({ default: module.QcSampleRequirementForm })));
const TraceabilitySystem = lazy(() => import("./pages/TraceabilitySystem").then((module) => ({ default: module.TraceabilitySystem })));
const ReelStockTakerReport = lazy(() => import("./pages/ReelStockTakerReport").then((module) => ({ default: module.ReelStockTakerReport })));
const PhysicalStockMaster = lazy(() => import("./pages/PhysicalStockMaster").then((module) => ({ default: module.PhysicalStockMaster })));
const PhysicalStockSessions = lazy(() => import("./pages/PhysicalStockSessions").then((module) => ({ default: module.PhysicalStockSessions })));
const PhysicalStockExcessReport = lazy(() => import("./pages/PhysicalStockVarianceReports").then((module) => ({ default: module.PhysicalStockExcessReport })));
const PhysicalStockShortageReport = lazy(() => import("./pages/PhysicalStockVarianceReports").then((module) => ({ default: module.PhysicalStockShortageReport })));
const TruckStatusUpdate = lazy(() => import("./pages/TruckStatusUpdate").then((module) => ({ default: module.TruckStatusUpdate })));
const TruckLogs = lazy(() => import("./pages/TruckLogs").then((module) => ({ default: module.TruckLogs })));
import { PublicDriverStatus } from "./pages/PublicDriverStatus";
const VehicleLiveUpdate = lazy(() => import("./pages/VehicleLiveUpdate").then((module) => ({ default: module.VehicleLiveUpdate })));

function BlankPage({ title }: { title: string }) {
  return (
    <div className="bg-white p-6 rounded shadow-sm border border-black">
      <h2 className="text-xl font-bold text-black mb-4 uppercase">{title}</h2>
      <p className="text-black font-medium">This module is currently under construction.</p>
    </div>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  if (user?.role === "TruckDriver") {
    return <Navigate to="/truck/status-update" replace />;
  }
  const firstAssignedView = user?.menuAccess.find((path) => path.startsWith("/") && path !== "/" && !path.includes("*"));
  return <Navigate to={firstAssignedView || "/operations-dashboard"} replace />;
}

function HashRouteSync() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const syncRouteFromHash = () => {
      const target = window.location.hash.slice(1) || "/";
      const current = `${location.pathname}${location.search}`;
      if (target !== current) {
        navigate(target, { replace: true });
      }
    };

    window.addEventListener("hashchange", syncRouteFromHash);
    return () => window.removeEventListener("hashchange", syncRouteFromHash);
  }, [location.pathname, location.search, navigate]);

  return null;
}

export default function App() {
  return (
    <HashRouter>
      <HashRouteSync />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="/driver-status" element={<PublicDriverStatus />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route path="plant-head" element={<PlantHeadUnified />} />
          <Route path="truck/status-update" element={<TruckStatusUpdate />} />
          <Route path="truck/live-update" element={<VehicleLiveUpdate />} />
          <Route path="truck/logs" element={<TruckLogs />} />
          
          {/* Masters */}
          <Route path="masters/item-groups" element={<ItemGroups />} />
          <Route path="masters/material-groups" element={<MaterialGroups />} />
          <Route path="masters/items" element={<LegacyItemsMaster />} />
          <Route path="masters/materials" element={<Materials />} />
          <Route path="masters/suppliers" element={<Suppliers />} />
          <Route path="masters/states" element={<States />} />
          <Route path="masters/units" element={<Units />} />
          <Route path="masters/colors" element={<ColorMasters />} />
          <Route path="masters/gst-rates" element={<GstRateMasters />} />
          <Route path="masters/expenses" element={<ExpenseMasters />} />
          <Route path="masters/companies" element={<Companies />} />
          <Route path="masters/trucks" element={<Trucks />} />
          <Route path="masters/machines" element={<Machines />} />
          <Route path="masters/rapc-ranges" element={<RapcRangeMaster />} />
          <Route path="masters/spec" element={<NewSpec />} />
          <Route path="masters/npd" element={<NpdMaster />} />
          <Route path="masters/php-item-master" element={<PhpItemMaster />} />
          <Route path="masters/plate-item-master" element={<PlateItemMaster />} />
          <Route path="masters/users" element={<Users />} />
          <Route path="masters/services" element={<Services />} />
          <Route path="masters/whatsapp" element={<WhatsappMaster />} />
          <Route path="masters/settings" element={<SettingsPage />} />
          <Route path="masters/firms" element={<FirmMaster />} />

          {/* Indent */}
          <Route path="indent/form" element={<IndentForm />} />
          <Route path="indent/view/:id" element={<IndentDetail />} />
          <Route path="indent/pending" element={<IndentPending />} />
          <Route path="indent/approved" element={<IndentApproved />} />
          <Route path="indent/completed" element={<IndentCompleted />} />
          <Route path="indent/rejected" element={<IndentRejected />} />

          {/* Purchase Orders */}
          <Route path="purchase-orders/pending-po" element={<Navigate to="/purchase-orders/pending-approval" replace />} />
          <Route path="purchase-orders/pending-indent-lines" element={<PurchaseOrderPendingIndentLines />} />
          <Route path="purchase-orders/create/:indentId" element={<PurchaseOrderCreate />} />
          <Route path="purchase-orders/all" element={<PurchaseOrderAll />} />
          <Route path="purchase-orders/pending-approval" element={<PurchaseOrderPendingApproval />} />
          <Route path="purchase-orders/approved" element={<PurchaseOrderApproved />} />
          <Route path="purchase-orders/rejected" element={<PurchaseOrderRejected />} />
          <Route path="purchase-orders/item-not-received" element={<PurchaseOrderItemNotReceived />} />
          <Route path="purchase-orders/item-cancelled" element={<PurchaseOrderItemCancelled />} />

          {/* Gate Entry */}
          <Route path="gate-entry/form" element={<GateEntryForm />} />
          <Route path="gate-entry/master" element={<GateEntryMaster />} />
          <Route path="gate-entry/cancelled" element={<CancelledGateEntry />} />

          {/* Material Receipt */}
          <Route path="material-receipt/pending-mrr" element={<PendingMrr />} />
          <Route path="material-receipt/approvals" element={<MrrApprovals />} />
          <Route path="material-receipt/pending-ph-approval" element={<PendingPHApproval />} />
          <Route path="material-receipt/pending-accounts-approval" element={<PendingAccountsApproval />} />
          <Route path="material-receipt/pending-md-approval" element={<PendingMDApproval />} />
          <Route path="material-receipt/pending-tally" element={<PendingTallyEntry />} />
          <Route path="material-receipt/pending-debit-note" element={<PendingDebitNote />} />
          <Route path="material-receipt/pending-credit-note" element={<PendingCreditNote />} />

          {/* Material Movement */}
          <Route path="material-movement/reel-issue-return" element={<ReelIssueReturnForm />} />
          <Route path="material-movement/reel-issue-return-scan" element={<ProductionPendingReelIssueScan />} />
          <Route path="material-movement/reel-issue-return-scan/form" element={<ReelIssueReturnScan />} />
          <Route path="material-movement/daily-consumption" element={<DailyConsumptionIssueForm />} />
          <Route path="material-movement/daily-consumption-master" element={<DailyConsumptionMaster />} />
          <Route path="material-movement/issue" element={<MaterialIssueForm />} />
          <Route path="material-movement/issue-master" element={<MaterialIssueMaster />} />
          <Route path="material-movement/pending-non-job-issue" element={<PendingNonJobMaterialIssue />} />
          <Route path="material-movement/pending-consumption-tally" element={<PendingConsumptionTallyPosting />} />
          <Route path="material-movement/non-job-issue-master" element={<NonJobIssueMaster />} />
          <Route path="material-movement/return" element={<MaterialReturnForm />} />
          <Route path="material-movement/reel-return" element={<ReelReturnForm />} />
          <Route path="material-movement/reel-return/qr" element={<ReelReturnForm mode="qr" />} />
          <Route path="material-movement/reel-transfer" element={<ReelTransferForm />} />
          <Route path="material-movement/return-master" element={<MaterialReturnMaster />} />

          {/* Orders */}
          <Route path="orders/form" element={<OrderForm />} />
          <Route path="orders/pending-ph" element={<OrdersPendingPH />} />
          <Route path="orders/pending-scheduling" element={<OrdersPendingScheduling />} />
          <Route path="orders/master" element={<OrdersMaster />} />
          <Route path="orders/scheduled" element={<ScheduledOrdersMaster />} />
          <Route path="orders/scheduled-pending" element={<PendingScheduledOrders />} />
          <Route path="orders/canceled" element={<CanceledOrders />} />
          
          {/* Material In */}
          <Route path="material-in/form" element={<MaterialInForm />} />
          <Route path="material-in/master" element={<MaterialInMaster />} />
          <Route path="material-in/item-master" element={<MaterialInItemMaster />} />
          
          {/* Production */}
          <Route path="production/form" element={<ProductionForm />} />
          <Route path="production/pending" element={<PendingProduction />} />
          <Route path="production/pending-npd" element={<PendingNpd />} />
          <Route path="production/upcoming" element={<UpcomingScheduledOrders />} />
          <Route path="production/pending-consumption" element={<ProductionPendingConsumption />} />
          <Route path="production/pending-material-return" element={<PendingMaterialReturn />} />
          <Route path="production/pending-job-transfer" element={<PendingJobTransfer />} />
          <Route path="production/pending-tally" element={<ProductionPendingTally />} />
          <Route path="production/pending-job-closure" element={<PendingJobClosure />} />
          <Route path="production/pending-machine-processing" element={<MachinePendingProcessing />} />
          <Route path="production/pending-printing" element={<PendingPrinting />} />
          <Route path="production/master" element={<ProductionMaster />} />
          <Route path="production/php/master" element={<PhpProductionMaster />} />
          <Route path="production/php/pending-planning" element={<PendingPhpPlanning />} />
          <Route path="production/php/scheduling" element={<PhpProductionScheduling />} />
          <Route path="production/php/pending-production" element={<PhpProductionExecution />} />
          <Route path="production/php-plate/scheduling" element={<PhpPlateProductionScheduling />} />
          <Route path="production/php-plate/sequencing" element={<PhpPlateProductionSequencing />} />
          <Route path="production/php-plate/pending-production" element={<PhpPlateProductionExecution />} />
          <Route path="production/php-plate/in-out" element={<PhpPlateInOut />} />
          <Route path="production/plate/master" element={<PlateProductionMaster />} />
          <Route path="production/plate/pending-planning" element={<PendingPlatePlanning />} />
          <Route path="production/plate/scheduling" element={<PlateProductionScheduling />} />
          <Route path="production/plate/pending-production" element={<PlateProductionExecution />} />
          <Route path="production/plan" element={<ProductionPlan />} />
          <Route path="operations-dashboard" element={<OperationDashboard />} />
          <Route path="audit-dashboard" element={<AuditDashboard />} />
          <Route path="production-processing/form" element={<ProductionProcessingForm />} />
          <Route path="production-processing/master" element={<ProductionProcessingMaster />} />
          <Route path="production-processing/manufacturing-journal" element={<ManufacturingJournal />} />
          <Route path="production/least-cost" element={<ItemwiseLeastCost />} />
          <Route path="production/canceled" element={<CanceledProductions />} />

          {/* Samples */}
          <Route path="samples/form" element={<SampleForm />} />
          <Route path="samples/pending" element={<PendingSamples />} />
          <Route path="samples/produced" element={<SamplesProduced />} />
          <Route path="samples/master" element={<SampleMaster />} />

          {/* Quality */}
          <Route path="quality/boardline-qc/form" element={<BoardLineQcForm />} />
          <Route path="quality/boardline-qc/master" element={<BoardLineQcMaster />} />
          <Route path="quality/printing-qc/form" element={<PrintingQcForm />} />
          <Route path="quality/printing-qc/master" element={<PrintingQcMaster />} />
          <Route path="quality/printing-wastage/form" element={<QcPrintingWastageForm />} />
          <Route path="quality/printing-wastage/master" element={<QcPrintingWastageMaster />} />
          <Route path="quality/php-plate/in-out/form" element={<QcPhpPlateInOutForm />} />
          <Route path="quality/php-plate/in-out/master" element={<QcPhpPlateInOutMaster />} />
          <Route path="quality/php-plate/in-out" element={<PhpPlateInOut />} />
          <Route path="quality/qc-master-data" element={<QcMasterData />} />
          <Route path="quality/qc-update/form" element={<QcUpdateForm />} />
          <Route path="quality/qc-update/master" element={<QcUpdateMaster />} />
          <Route path="quality/qc-update/file-no-master" element={<QcFileNoMaster />} />
          <Route path="quality/special-remarks/form" element={<SpecialRemarkForm />} />
          <Route path="quality/special-remarks" element={<SpecialRemarkMaster />} />
          <Route path="quality/printing-stereo/form" element={<Navigate to="/quality/block-record/form" replace />} />
          <Route path="quality/printing-stereo" element={<PrintingStereoMaster />} />
          <Route path="quality/block-record/form" element={<QcBlockRecordForm />} />
          <Route path="quality/qc-view" element={<QcView />} />
          <Route path="quality/qc-score" element={<QcScore />} />
           <Route path="quality/traceability" element={<TraceabilitySystem />} />
           <Route path="quality/traceability/:productionId" element={<TraceabilitySystem />} />
          <Route path="quality/pdi-report" element={<PdiReport />} />
          <Route path="quality/complaints/form" element={<QualityComplaintForm />} />
          <Route path="quality/complaints/master" element={<QualityComplaintMaster />} />
          <Route path="quality/complaints/pending-capa" element={<QualityPendingCapa />} />
          <Route path="quality/complaints/:id/capa" element={<QualityComplaintCapa />} />
          <Route path="quality/capa/master" element={<QualityCapaMaster />} />
          <Route path="quality/spec-card-issue-return" element={<QcSpecCardIssueReturn />} />
          <Route path="quality/spec-card-issue-return/form" element={<QcSpecCardIssueReturnForm />} />          <Route path="quality/block-location-master" element={<QcBlockLocationMaster />} />
          <Route path="quality/pre-dispatch-inspection" element={<PreDispatchInspection />} />
          <Route path="quality/pre-dispatch-inspection/form" element={<PreDispatchInspectionForm />} />
          <Route path="quality/coa/form" element={<CoaForm />} />
          <Route path="quality/coa/form/:id" element={<CoaForm />} />
          <Route path="quality/coa/master" element={<CoaMaster />} />
          <Route path="quality/coa/templates" element={<CoaTemplateMaster />} />
          <Route path="quality/sample-requirement" element={<QcSampleRequirement />} />
          <Route path="quality/sample-requirement/master" element={<QcSampleRequirementMaster />} />
          <Route path="quality/sample-requirement/master/form" element={<QcSampleRequirementForm />} />
          
          {/* Dispatch */}
          <Route path="dispatch/pending-planning" element={<PendingDispatchPlanning />} />
          <Route path="dispatch/master" element={<DispatchPlansMaster />} />

          {/* Loading */}
          <Route path="loading/pending" element={<PendingLoading />} />
          <Route path="loading/master" element={<LoadingMaster />} />
          <Route path="loading/php/master" element={<PhpLoadingMaster />} />
          <Route path="loading/php/pending-tally" element={<PendingPhpLoadingTallyPosting />} />
          <Route path="loading/plate/master" element={<PlateLoadingMaster />} />
          <Route path="loading/plate/pending-tally" element={<PendingPlateLoadingTallyPosting />} />

          {/* Billing */}
          <Route path="billing/pending" element={<PendingInvoicing />} />
          <Route path="billing/pending-tally" element={<BillingPendingTally />} />
          <Route path="billing/master" element={<InvoicesMaster />} />

          {/* Gate Pass */}
          <Route path="gate-pass/form" element={<GatePassForm />} />
          <Route path="gate-pass/master" element={<GatePassMaster />} />
          <Route path="gate-pass/pending-returnable" element={<PendingReturnableItems />} />

          {/* Reports */}
          <Route path="reports/other-consumables-inventory" element={<OtherConsumablesInventoryReport />} />
          <Route path="reports/erp-wise-reel-stock" element={<ErpWiseReelStockReport />} />
          <Route path="reports/fg-stock" element={<FGStockReport />} />
          <Route path="reports/reelwise-stock" element={<ReelwiseStockReport />} />
          <Route path="reports/reel-stock-taker" element={<Navigate to="/physical-stock/entry" replace />} />
          <Route path="reports/physical-stock-master" element={<Navigate to="/physical-stock/master" replace />} />
          <Route path="physical-stock/sessions" element={<PhysicalStockSessions />} />
          <Route path="physical-stock/entry" element={<ReelStockTakerReport />} />
          <Route path="physical-stock/excess" element={<PhysicalStockExcessReport />} />
          <Route path="physical-stock/shortage" element={<PhysicalStockShortageReport />} />
          <Route path="physical-stock/master" element={<PhysicalStockMaster />} />
          <Route path="reports/jobwise-reel-consumption" element={<JobwiseReelConsumptionReport />} />
          <Route path="reports/job-consumption" element={<JobConsumption />} />
          <Route path="reports/jobs-in-progress" element={<JobsInProgressReport />} />
          <Route path="reports/efficiency" element={<EfficiencyReport />} />
          <Route path="reports/hit-vs-miss" element={<HitVsMissReport />} />
          <Route path="reports/realization" element={<RealizationReport />} />
          <Route path="reports/lm-l1" element={<LmL1Report />} />
          <Route path="reports/paper-requirement" element={<PaperRequirementReport />} />
          <Route path="reports/fixed-monthly-expenses" element={<FixedMonthlyExpenses />} />
          <Route path="reports/fixed-daily-expenses" element={<FixedDailyExpenses />} />
          <Route path="reports/conversion-cost-month-wise" element={<ConversionCostMonthWiseReport />} />
          <Route path="reports/conversion-cost-details" element={<ConversionCostDetailsReport />} />
          <Route path="reports/truck-status" element={<TruckStatusReport />} />
          <Route path="reports/wastage" element={<WastageReport />} />
          <Route path="reports/summary-sheet" element={<SummarySheetReport />} />

          {/* Documentation */}
          <Route path="plans/production-planning" element={<PlansProductionPlanning />} />
          <Route path="plans/production" element={<PlansProduction />} />
          <Route path="plans/items" element={<PlansItems />} />
          <Route path="plans/loading" element={<PlansLoading />} />
          <Route path="plans/job-card" element={<PlansJobCard />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
