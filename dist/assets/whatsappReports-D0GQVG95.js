import{E as H}from"./jspdf.es.min-Dz-ioT1b.js";import{a as M}from"./jspdf.plugin.autotable-CbV6WxIO.js";import{b as j,r as q}from"./fluteBatch-BoKcTxbQ.js";import{f as C}from"./serial-DT_yXzaW.js";import{f as K,p as J}from"./realizationTargets-BVQ4pWOF.js";import{l as U}from"./index-9Viu-ehh.js";const b=e=>String(e??"").trim();function V(e,t,a,n){return{name:[{companyName:(a?.companyId?n.find(i=>String(i.id)===String(a.companyId)):void 0)?.name},e,t||{},a||{}].map(i=>b(i.companyName)).find(Boolean)||b(e.firmName)||b(t?.firmName)||b(a?.firmName)||"-",companyId:b(a?.companyId)}}function D(e){const t=Number(e);return Number.isFinite(t)?t:0}function v(e){return String(e||"").trim()}function T(e){return v(e.productionPlanCompanyName||e.companyName)}function R(e){return v(e.fluteBatches)}function Y(e,t){if(!e||!t)return e===t?0:e?-1:1;const a=Number(e),n=Number(t);return Number.isFinite(a)&&Number.isFinite(n)&&a!==n?a-n:e.localeCompare(t,void 0,{sensitivity:"base",numeric:!0})}function N(e){return D(e.reelActualWithTrimming)}function x(e){const a=v(e.transactionNo||e.jobCardNo).match(/(\d+)\s*$/);return a?Number(a[1]):Number.MAX_SAFE_INTEGER}function Z(e,t){return T(e).localeCompare(T(t),void 0,{sensitivity:"base"})||N(t)-N(e)}function X(e,t){return N(t)-N(e)}function w(e,t){const a=[...e];return a.length===0?[...t]:(t.forEach(n=>{const r=N(n);let l=e[0],d=Number.POSITIVE_INFINITY;e.forEach(h=>{const o=Math.abs(N(h)-r);o<d&&(d=o,l=h)});const i=a.indexOf(l),p=r<=N(l);a.splice(Math.max(0,i+(p?1:0)),0,n)}),a)}function ee(e){const t=new Map;return e.forEach(a=>{const r=T(a).toLowerCase();t.set(r,[...t.get(r)||[],a])}),Array.from(t.values()).sort((a,n)=>{const r=Math.max(...a.map(N));return Math.max(...n.map(N))-r||T(a[0]).localeCompare(T(n[0]),void 0,{sensitivity:"base"})}).flat()}function ne(e){const t=[...e].sort((n,r)=>x(n)-x(r)),a=new Map;return t.forEach(n=>{const r=R(n).toLowerCase();a.set(r,[...a.get(r)||[],n])}),Array.from(a.values()).sort((n,r)=>Y(R(n[0]),R(r[0]))).flatMap(n=>{const r=n.filter(i=>D(i.plannedProductionInMeter)>200).sort(Z),l=n.filter(i=>D(i.plannedProductionInMeter)<=200).sort(X),d=w(r,l);return ee(d)})}function W(e){return String(e??"").replace(/\s+/g," ").trim().toLowerCase()}function L(e){return String(e??"").replace(/,/g,"").replace(/\s+/g,"").trim()}function I(e){const a=L(e).match(/(\d+)$/);return a?Number(a[1]):null}function te(e){const t=new Set;return e.forEach(a=>{const n=L(a.jobCardNo);if(!n)return;t.add(n);const r=I(n);r!==null&&t.add(String(r))}),t}function ae(e,t,a){return e.map((n,r)=>{const l=e[r-1],d=L(n.transactionNo||n.jobCardNo),i=I(l?.transactionNo||l?.jobCardNo),p=!!(l&&I(d)!==null&&i!==null&&I(d)===i+1&&W(n.itemName)===W(l.itemName)),h=I(d),m=t.has(d)||h!==null&&t.has(String(h))||p,g=Number(n.realizationPerKg),y=!m&&a!==null&&Number.isFinite(g)&&g<a;return{...n,isSample:m,shouldHighlight:y}})}const me=["production-plan","dispatch-plan"],ue=["production-plan","php-planning","plate-planning"],B={"production-plan":"/production/plan","dispatch-plan":"/dispatch/plan","pending-loading":"/loading/pending","php-planning":"/production/php/pending-planning","plate-planning":"/production/plate/pending-planning"},pe=e=>Object.keys(B).find(t=>B[t]===e),ge={"production-plan":`🏭 *PRODUCTION PLAN*

*Plan Date:* {{date}}
*Firm:* {{firm}}
*Jobs:* {{jobs}}
*Total Plan Qty:* {{totalQty}}
*Total Paper Weight:* {{totalPaperWeight}} Kg
*Total Value:* ₹{{totalValue}}

📄 Production Plan PDF attached.`,"dispatch-plan":`🚚 *DISPATCH PLAN*

*Plan Date:* {{date}}
*Plans:* {{plans}}
*Planned Qty:* {{planned}}
*Invoiced Qty:* {{invoiced}}
*Pending Qty:* {{pending}}

📄 Dispatch Plan PDF attached.`,"pending-loading":`📦 *PENDING LOADING*

*As on:* {{dateTime}}
*Pending Plans:* {{plans}}
*Planned Qty:* {{planned}}
*Loaded Qty:* {{loaded}}
*Pending Qty:* {{pending}}

📄 Pending Loading PDF attached.`,"php-planning":`🗂️ *PENDING PHP PLANNING*

*As on:* {{dateTime}}
*Firm:* {{firm}}
*Schedules:* {{schedules}}
*Required Qty:* {{required}}
*Already Planned:* {{planned}}
*Remaining to Plan:* {{remaining}}

📄 Pending PHP Planning PDF attached.`,"plate-planning":`🗂️ *PENDING PLATE PLANNING*

*As on:* {{dateTime}}
*Firm:* {{firm}}
*Schedules:* {{schedules}}
*Required Qty:* {{required}}
*Already Planned:* {{planned}}
*Remaining to Plan:* {{remaining}}

📄 Pending Plate Planning PDF attached.`},s=e=>Number(e||0).toLocaleString("en-IN"),_=e=>e.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}),u=e=>String(e??"").trim(),G=e=>{const t=new Date(u(e));return Number.isNaN(t.getTime())?"":t.toLocaleString("sv-SE",{timeZone:"Asia/Kolkata"}).slice(0,10)};function fe(e,t,a={}){const{productions:n,schedules:r,orders:l,companies:d,sampleRequests:i,settings:p,fluteMasters:h,npdItems:o}=e,m=j(h),g=te(i),y=K(J(p[0]?.realizationPerKgTargets),t),A=y?Number(y.value||0)*.98:null,S=new Map;n.forEach(c=>{if(c.status==="Cancelled"||c.cancelTimestamp)return;const f=u(c.erpCode),P=Number(c.gsm||0);f&&P>0&&(!S.has(f)||P<S.get(f))&&S.set(f,P)});const $=new Map(o.map(c=>[u(c.id),c])),k=new Map(r.map(c=>[c.id,c])),z=new Map(l.map(c=>[c.id,c])),Q=n.filter(c=>(u(c.date)?G(c.date)||u(c.date):"")===t).map(c=>{const f=k.get(c.scheduleId),P=f?z.get(f.orderId):void 0,E=V(c,f,P,d),F=$.get(u(c.itemId));return{production:c,company:E,item:F}}).filter(({production:c,company:f,item:P})=>{if(a.companies?.length&&!a.companies.some(F=>F===f.companyId||F===f.name))return!1;const E=P?.id||`${P?.name||""}::${c.erpCode||""}`;return!a.item||E===a.item}).map(({production:c,company:f,item:P})=>({...c,leastGsm:S.get(u(c.erpCode))??c.leastGsm,fluteBatches:q(c.flute,m,c.fluteBatches),productionPlanCompanyName:f.name,productionPlanCompanyId:f.companyId,itemName:P?.name||""}));return ae(ne(Q),g,A)}function he(e,t,a=""){const n=o=>{if(o===""||o===null||o===void 0)return"";const m=Number(o);if(!Number.isFinite(m))return String(o);const g=Math.round(m*100)/100;return Number.isInteger(g)?String(g):g.toFixed(2)},r=o=>{const m=u(o.transactionNo||o.jobCardNo);return m.match(/(\d+)\s*$/)?.[1]||m||"-"};let l=0,d=0,i=0;const p=[],h=e.map((o,m)=>{const g=(Number(o.qty||0)||0)*(Number(o.rate||0)||0);return l+=g,d+=Number(o.totalPaperWeight||0)||0,i+=Number(o.qty||0)||0,o.shouldHighlight&&p.push(m),[r(o),u(o.productionPlanCompanyName),u(o.itemName),u(o.erpCode),n(o.ups),n(o.qty),n(o.reelAsPerCalc),n(o.reelActualWithTrimming),n(o.cuttingWithTrimming),n(o.ply),u(o.flute),n(o.l1),n(o.f1),n(o.l2),n(o.f2),n(o.l3),n(o.gsm),n(o.totalPaperWeight),n(o.plannedProductionInMeter),n(o.realizationPerKg),n(o.sheetWeight),n(o.rate),g.toFixed(2),o.isSample?"YES":"",u(o.remarks)]});return{report:"production-plan",title:"Production Plan",subtitle:`Date: ${C(t)}${a?`   Firm: ${a}`:""}`,head:[`Job
No`,"Company Name","Item Name",`ERP
CODE`,"UPS",`Plan
QTY`,`Reel As
Per
Calculation`,`REEL
Actual
with
TRIMMING`,`CUTTING
with
TRIMMING`,"PLY","FLUTE","L1","F1","L2","F2","L3","GSM",`TOTAL
Paper
WEIGHT`,`Planned
Production
in Meter`,`REALIZATION
PER KG`,`SHEET
WEIGHT`,"Rate","Value","Sample","Remark"],body:h,foot:["TOTAL",...Array(16).fill(""),d.toFixed(2),...Array(4).fill(""),l.toFixed(2),"",""],highlightRows:p,values:{date:C(t),firm:a||"All firms",jobs:String(e.length),totalQty:s(Math.round(i)),totalPaperWeight:_(d),totalValue:_(l)},fileName:`Production_Plan_${t}.pdf`}}function Pe(e,t,a){const n=new Map(e.orders.map(i=>[i.id,i])),r=new Map(e.companies.map(i=>[i.id,i])),l=new Map(e.schedules.map(i=>[i.id,i.firmId])),d=new Map(e.trucks.map(i=>[i.id,i]));return e.plans.filter(i=>G(i.date)===a).map(i=>{const p=n.get(i.orderId),h=t(p),o=u(h?.name),m=u(p?.erpCode||h?.erp),g=String(p?.firmId||i.orderFirmId||i.firmId||l.get(i.scheduleId)||""),y=Number(i.plannedQty||0),A=Number(i.loadedQty||0),S=Number(i.canceledQty||0);return{plan:i,firmId:g,firmName:U(g,e.firms),companyName:u(r.get(p?.companyId)?.name),orderNo:String(p?.orderNo||""),itemName:o&&m&&!o.toLowerCase().includes(m.toLowerCase())?`${o} - ${m}`:o||m,itemKey:`${o}::${m}`,truckNo:String(d.get(String(i.truckId||""))?.truckNo||i.truckNo||""),planned:y,invoiced:A,cancelled:S,pending:y-A-S}})}const oe=["Sr.","Plan No","Firm","Company","Order No","Item","Truck","Planned","Invoice Qty","Cancl","Pending","Status"];function Ne(e,t){const a=e.reduce((n,r)=>({planned:n.planned+r.planned,invoiced:n.invoiced+r.invoiced,cancelled:n.cancelled+r.cancelled,pending:n.pending+r.pending}),{planned:0,invoiced:0,cancelled:0,pending:0});return{report:"dispatch-plan",title:"Dispatch Plan",subtitle:`Date: ${C(t)}`,head:oe,body:e.map((n,r)=>[String(r+1),u(n.plan.planNo),n.firmName,n.companyName,n.orderNo,n.itemName,n.truckNo,s(n.planned),s(n.invoiced),s(n.cancelled),s(n.pending),u(n.plan.status)]),foot:["TOTAL","","","","","","",s(a.planned),s(a.invoiced),s(a.cancelled),s(a.pending),""],values:{date:C(t),plans:String(e.length),planned:s(a.planned),invoiced:s(a.invoiced),cancelled:s(a.cancelled),pending:s(a.pending)},fileName:`Dispatch_Plan_${t}.pdf`}}const O=e=>e.match(/(\d{2}-\d{2}\/[^/]+)$/)?.[1]||e||"-";function ye(e,t){const a=e.reduce((l,d)=>({planned:l.planned+d.planned,loaded:l.loaded+d.loaded,pending:l.pending+d.pending}),{planned:0,loaded:0,pending:0}),n=t.toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!0}),r=t.toLocaleString("sv-SE",{timeZone:"Asia/Kolkata"}).slice(0,16).replace(/[: ]/g,"-");return{report:"pending-loading",title:"Pending Loading",subtitle:`As on: ${n}`,head:["Sr.","Plan Date","Plan No","Order No","Firm","Company","Item","Source","Planned","Loaded","Pending"],body:e.map((l,d)=>[String(d+1),C(l.date),O(l.planNo),O(l.orderNo),l.firmName,l.companyName,l.itemName,l.itemSource,s(l.planned),s(l.loaded),s(l.pending)]),foot:["TOTAL","","","","","","","",s(a.planned),s(a.loaded),s(a.pending)],values:{dateTime:n,plans:String(e.length),planned:s(a.planned),loaded:s(a.loaded),pending:s(a.pending)},fileName:`Pending_Loading_${r}.pdf`}}function Se(e){const t=new H({orientation:"landscape",unit:"mm",format:"a4"}),a=t.internal.pageSize.getWidth(),n=e.report==="production-plan";t.setFont("helvetica","bold"),t.setFontSize(14),t.text(e.title,a/2,12,{align:"center"}),t.setFontSize(n?8:10),t.text(e.subtitle,a/2,18,{align:"center"});const r=new Set(e.highlightRows||[]);if(n)return M(t,{head:[e.head],body:e.body,foot:e.foot?[e.foot]:void 0,startY:22,margin:{left:6,right:6},theme:"grid",showFoot:"lastPage",rowPageBreak:"avoid",styles:{font:"helvetica",fontSize:5.5,cellPadding:.8,halign:"center",valign:"middle",textColor:0,lineColor:0,lineWidth:.15,overflow:"linebreak"},headStyles:{fillColor:[255,255,255],textColor:0,fontStyle:"bold",fontSize:5.5},footStyles:{fillColor:[255,255,255],textColor:0,fontStyle:"bold"},columnStyles:{0:{cellWidth:9},1:{cellWidth:28},2:{cellWidth:34},3:{cellWidth:11},19:{cellWidth:16},22:{cellWidth:13},23:{cellWidth:9},24:{cellWidth:26}},didParseCell:d=>{d.section==="foot"&&d.column.index===0&&(d.cell.styles.halign="left"),d.section==="body"&&r.has(d.row.index)&&(d.cell.styles.fillColor=[255,153,153])}}),t;const l=e.report==="dispatch-plan"?[7,8,9,10]:e.report==="pending-loading"?[8,9,10]:[9,10,11,12,13];return M(t,{startY:22,head:[e.head],body:e.foot?[...e.body,e.foot]:e.body,styles:{fontSize:7,cellPadding:1.2,lineColor:[0,0,0],lineWidth:.1},headStyles:{fillColor:[49,46,129],textColor:255,fontStyle:"bold"},columnStyles:Object.fromEntries(l.map(d=>[d,{halign:"right"}])),didParseCell:d=>{d.section==="body"&&e.foot&&d.row.index===e.body.length&&(d.cell.styles.fontStyle="bold")}}),t}export{me as D,ue as F,ge as a,Se as b,fe as c,Pe as d,Ne as e,ye as f,he as p,V as r,pe as w};
