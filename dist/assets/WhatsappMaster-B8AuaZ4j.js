import{u as Q,a as q,r,j as e,S as z,Y as H,aV as U}from"./index-BzvjViW2.js";import{c as Y}from"./masterPermissions-DlO3FJ37.js";const S="/quality/complaints/form",K=`🚨 *QC Complaint Alert*

*Complaint No.:* {{complaintNo}}
*Complaint Date:* {{dateOfComplaint}}
*Job / Lot No.:* {{lotNo}}
*Party:* {{partyName}}
*Item:* {{itemName}}
*ERP Code:* {{erpCode}}
*Nature:* {{natureOfComplaint}}
*Quantity:* {{quantity}}
*Area:* {{areaOfIssue}}
*Issue Details:* {{issueDetails}}
*Photos:* Attached separately.

Please review this complaint and take the necessary action.`,J="/quality/boardline-qc/form",V=`📋 *BOARDLINE QC CHECK*

*Job No.:* {{jobNo}}
*Party Name:* {{partyName}}
*Item Name:* {{itemName}}
*ERP Code:* {{erp}}

*Sampling Plan Qty.:* {{samplingPlanQty}}
*Check No.:* {{samplingCheckNo}}

*Size Details*
*Standard (Flap - Height - Flap):* {{standard}}
*Actual - Operator Side:* {{flapHeightFlapOperatorSide}}
*Actual - Drive Side:* {{flapHeightFlapDriveSide}}

*Cutting Size Required:* {{cuttingSizeRequired}}
*Cutting Size Achieved:* {{cuttingSizeMm}}

*Board Details*
*B.GSM:* {{boardGsm}}
*Type of Flute:* {{typeOfFlute}}
*Board Thickness:* {{boardThickness}}
*Moisture:* {{moisture}}
*Sheet Weight:* {{sheetWeightGrams}}

*BOARDLINE REMARKS*
{{boardlineRemarks}}

*QC Person:* {{qcPerson}}

*PRINTING ARTWORK*
{{printingArtwork}}`,$="/quality/printing-qc/form",X="/reports/printing-shift",Z=`*Printing Report ({{shiftHours}}) {{date}}*

{{jobLines}}

*Total Qty in Shift:* {{totalQty}}
*Boxes Per Hour:* {{boxesPerHour}}`,ee=`🖨️ *PRINTING QC CHECK*

*Job No.:* {{jobNo}}
*Party Name:* {{partyName}}
*Item Name:* {{itemName}}
*ERP:* {{erp}}

*Sampling Plan Qty.:* {{samplingPlanQty}}
*Check No.:* {{samplingCheckNo}}

*Box Size Details*
*Standard Box Size (L x W x H):* {{standardBoxSize}}
*Box Size Achieved (L x W x H):* {{boxSizeAchieved}}

*CS / BS Details*
*CS (Standard):* {{csStandard}}
*BS (Standard):* {{bsStandard}}
*BS Achieved:* {{bsAchieved}}

*Board Details*
*Board Thickness (Before):* {{boardThicknessBefore}}
*Board Thickness:* {{boardThickness}}
*Box Weight (Grams):* {{boxWeightGrams}}

*Printing Colour Details*
*Printing Colour 1 (Standard):* {{printingColor1Standard}}
*Colour 1 (Actual):* {{colour1Actual}}

*STANDARD ARTWORK*
{{standardArtwork}}

*QC Person:* {{qcPerson}}
*Operator Name:* {{operatorName}}`;function C(o){return o===X?Z:o===J?V:o===$?ee:K}function se(o){const u=[],d=new Set,m=(a,i)=>{if("items"in a){a.items.forEach(j=>m(j,a.section));return}!a.href||d.has(a.href)||(d.add(a.href),u.push({label:`${i} / ${a.name}`,value:a.href}))};return o.forEach(a=>a.items.forEach(i=>m(i,a.section))),u.sort((a,i)=>a.label.localeCompare(i.label))}function re(){const{user:o}=Q(),u=Y(o?.role),[d,,,m]=q("whatsapp_configs",[]),[a,i]=r.useState(""),[j,y]=r.useState(!1),[l,v]=r.useState(null),[w,x]=r.useState(""),[A,h]=r.useState(""),[k,b]=r.useState(""),[E,g]=r.useState(""),[P,c]=r.useState(""),[M,f]=r.useState("Yes"),[T,D]=r.useState(!1),L=r.useMemo(()=>se(U),[]),I=r.useMemo(()=>{const s=a.trim().toLowerCase();return[...d].filter(t=>!s||[t.loginId,t.groupId,t.menu,t.message].some(N=>String(N||"").toLowerCase().includes(s))).sort((t,N)=>String(t.loginId).localeCompare(String(N.loginId)))},[d,a]),R=()=>{v(null),x(""),h(""),b(""),g(S),c(C(S)),f("Yes"),y(!1)},G=()=>{v(null),x(""),h(""),b(""),g(S),c(C(S)),f("Yes"),y(!0)},W=s=>{v(s.id),x(s.loginId),h(""),b(s.groupId),g(s.menu),c(s.message),f(s.active==="No"?"No":"Yes"),y(!0)},_=async s=>{s.preventDefault();const t={loginId:w.trim(),pass:A,groupId:k.trim(),menu:E.trim(),message:P.trim()};if(!t.loginId||!t.groupId||!t.menu||!t.message||!l&&!t.pass){alert("LoginID, Pass, GroupId, Menu, and Message are required.");return}if(t.pass.trim()==="********"){alert("Enter the real Pass; the masked value cannot be saved as a password.");return}if(d.some(n=>n.id!==l&&n.loginId.trim().toLowerCase()===t.loginId.toLowerCase()&&n.groupId.trim().toLowerCase()===t.groupId.toLowerCase()&&n.menu===t.menu)){alert("A WhatsApp configuration already exists for this LoginID, GroupId, and Menu.");return}D(!0);try{const n=new Date().toISOString(),p={id:l||crypto.randomUUID(),loginId:t.loginId,groupId:t.groupId,menu:t.menu,message:t.message,active:M,updatedBy:o?.name||o?.email||"System User",updateTimestamp:n},O=t.pass?{...p,pass:t.pass}:p,B=await fetch("/api/whatsapp-configs",{method:"POST",headers:{"Content-Type":"application/json",...H()},body:JSON.stringify(O)});if(!B.ok){const F=await B.json().catch(()=>({}));throw new Error(F?.error||"Failed to save WhatsApp configuration.")}await m.refresh({force:!0}),R()}catch(n){console.error("Failed to save WhatsApp configuration:",n);const p=n.message;alert(new Set(["Pass is required for a new WhatsApp configuration.","Enter the real Pass; the masked value cannot be saved as a password.","The stored Pass must be replaced. Enter the current Message Auto Sender password."]).has(p)?p:"Failed to save WhatsApp configuration.")}finally{D(!1)}};return u?e.jsx("div",{className:"space-y-6",children:j?e.jsxs("div",{className:"bg-white p-6 rounded-[24px] shadow-sm border border-slate-200",children:[e.jsxs("div",{className:"flex flex-wrap justify-between items-start gap-4 mb-8",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-3xl font-black text-blue-700",children:l?"Edit WhatsApp Configuration":"New WhatsApp Configuration"}),e.jsx("p",{className:"text-slate-500 mt-1",children:"Save a message template for one application menu."})]}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("button",{type:"button",onClick:R,className:"px-8 py-3 rounded-2xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50",children:"Cancel"}),e.jsx("button",{type:"submit",form:"whatsapp-form",disabled:T,className:"px-8 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800 disabled:opacity-50",children:T?e.jsx(z,{size:18,className:"text-white"}):"Save"})]})]}),e.jsxs("form",{id:"whatsapp-form",onSubmit:_,className:"grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl",children:[e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["LoginID ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{value:w,onChange:s=>x(s.target.value),required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Pass ",e.jsx("span",{className:"text-red-500",children:l?"":"*"})]}),e.jsx("input",{type:"password",value:A,onChange:s=>h(s.target.value),required:!l,placeholder:l?"Leave blank to keep current password":"Enter password",className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["GroupId ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("input",{value:k,onChange:s=>b(s.target.value),required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Menu ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsxs("select",{value:E,onChange:s=>{const t=s.target.value;g(t),l||c(C(t))},required:!0,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500",children:[e.jsx("option",{value:"",children:"Select menu"}),L.map(s=>e.jsx("option",{value:s.value,children:s.label},s.value))]})]}),e.jsxs("label",{className:"space-y-2 md:col-span-2",children:[e.jsxs("span",{className:"text-blue-700 font-bold",children:["Auto-message template ",e.jsx("span",{className:"text-red-500",children:"*"})]}),e.jsx("textarea",{value:P,onChange:s=>c(s.target.value),required:!0,rows:5,className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"})]}),e.jsxs("label",{className:"space-y-2",children:[e.jsx("span",{className:"text-blue-700 font-bold",children:"Status"}),e.jsxs("select",{value:M,onChange:s=>f(s.target.value==="No"?"No":"Yes"),className:"w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500",children:[e.jsx("option",{value:"Yes",children:"Active"}),e.jsx("option",{value:"No",children:"Inactive"})]})]})]})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"flex flex-wrap justify-between items-center gap-4",children:[e.jsx("h2",{className:"text-3xl font-black text-blue-700",children:"WhatsApp Master"}),e.jsxs("div",{className:"flex flex-wrap items-center gap-3",children:[e.jsx("input",{value:a,onChange:s=>i(s.target.value),placeholder:"Search WhatsApp configuration",className:"w-[360px] max-w-full rounded-full border border-slate-300 px-6 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"}),e.jsx("button",{type:"button",onClick:G,className:"px-7 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800",children:"+ WhatsApp"})]})]}),e.jsxs("div",{className:"bg-white rounded-[22px] border border-slate-300 overflow-hidden",children:[e.jsxs("div",{className:"px-4 py-3 text-slate-600",children:["Showing ",I.length," entries"]}),e.jsx("div",{className:"table-sticky-scroll",children:e.jsxs("table",{className:"min-w-full border-collapse",children:[e.jsx("thead",{className:"sticky top-0 z-30",children:e.jsxs("tr",{className:"bg-indigo-700 text-white",children:[e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"LoginID"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Pass"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"GroupId"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Menu"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Message"}),e.jsx("th",{className:"px-4 py-4 text-left text-sm font-bold border-2 border-black",children:"Status"}),e.jsx("th",{className:"px-4 py-4 text-right text-sm font-bold border-2 border-black",children:"Action"})]})}),e.jsx("tbody",{children:I.length===0?e.jsx("tr",{children:e.jsx("td",{colSpan:7,className:"px-6 py-10 text-center border-2 border-black",children:"No WhatsApp configurations found."})}):I.map(s=>e.jsxs("tr",{children:[e.jsx("td",{className:"px-4 py-4 font-bold border-2 border-black",children:s.loginId}),e.jsx("td",{className:"px-4 py-4 border-2 border-black tracking-widest",children:"********"}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:s.groupId}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:L.find(t=>t.value===s.menu)?.label||s.menu}),e.jsx("td",{className:"px-4 py-4 border-2 border-black whitespace-pre-wrap max-w-[360px]",children:s.message}),e.jsx("td",{className:"px-4 py-4 border-2 border-black",children:s.active==="No"?"Inactive":"Active"}),e.jsx("td",{className:"px-4 py-3 text-right border-2 border-black",children:e.jsx("button",{type:"button",onClick:()=>W(s),className:"px-6 py-2 rounded-xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50",children:"Open"})})]},s.id))})]})})]})]})}):e.jsx("div",{className:"rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-700",children:"You do not have permission to manage WhatsApp configurations."})}export{re as WhatsappMaster};
