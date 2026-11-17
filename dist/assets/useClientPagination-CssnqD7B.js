<<<<<<<< HEAD:dist/assets/useClientPagination-HQZ8b0L_.js
import{r as a}from"./index-Cx56ay-G.js";function l(n,u=25){const[e,o]=a.useState(1),[t,i]=a.useState(u),c=n.length,s=Math.max(1,Math.ceil(c/t));a.useEffect(()=>{o(1)},[t]),a.useEffect(()=>{e>s&&o(s)},[e,s]);const g=a.useMemo(()=>{const r=(e-1)*t;return n.slice(r,r+t)},[n,e,t]);return{page:e,setPage:o,pageSize:t,setPageSize:i,totalItems:c,totalPages:s,paginatedItems:g}}export{l as u};
========
import{r as a}from"./index-DcdrHDTx.js";function l(n,u=25){const[e,o]=a.useState(1),[t,i]=a.useState(u),c=n.length,s=Math.max(1,Math.ceil(c/t));a.useEffect(()=>{o(1)},[t]),a.useEffect(()=>{e>s&&o(s)},[e,s]);const g=a.useMemo(()=>{const r=(e-1)*t;return n.slice(r,r+t)},[n,e,t]);return{page:e,setPage:o,pageSize:t,setPageSize:i,totalItems:c,totalPages:s,paginatedItems:g}}export{l as u};
>>>>>>>> origin/coa-templates:dist/assets/useClientPagination-CssnqD7B.js
