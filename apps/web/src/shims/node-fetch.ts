const nodeFetch = (...args: Parameters<typeof fetch>) => fetch(...args);

export default nodeFetch;
