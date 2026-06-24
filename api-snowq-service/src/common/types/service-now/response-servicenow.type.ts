export type ResponseServiceNow = {
    sys_id: string;
    number: string;
    short_description: string;
    state?: string;
}

export type ResponseServiceNowError = {
    error: {
        message: string;
        detail: string;
    };
}

export type ResponseServiceNowSuccess = {
    result: ResponseServiceNow;
};

