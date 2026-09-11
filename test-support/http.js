import assert from 'node:assert/strict';
export function apiClient(server) {
  let cookie='',csrf='';
  return async (route,method='GET',body,expected=200) => {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api${route}`,{
      method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    const data=response.headers.get('content-type').includes('json')?await response.json():await response.text();
    assert.equal(response.status,expected,JSON.stringify(data));
    if(data.csrf)csrf=data.csrf;
    return data;
  };
}
