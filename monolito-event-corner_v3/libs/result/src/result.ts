/**
 * Result type para manejo funcional de errores
 * Inspirado en Rust Result<T, E> y Scala Either
 * @module Result
 */

/**
 * Clase que representa el resultado de una operación que puede fallar.
 * Es inmutable y proporciona métodos para transformar y combinar resultados.
 *
 * @template T Tipo del valor en caso de éxito
 * @template E Tipo del error (por defecto Error)
 */
export class Result<T, E = Error> {
    private readonly _value: T | undefined;
    private readonly _error: E | undefined;
    public readonly isSuccess: boolean;
    public readonly isFailure: boolean;

    private constructor(isSuccess: boolean, value?: T, error?: E) {
        this.isSuccess = isSuccess;
        this.isFailure = !isSuccess;
        this._value = value;
        this._error = error;
        Object.freeze(this);
    }

    // ==================== FACTORIES ====================

    /**
     * Crea un Result exitoso.
     * @param value Valor de éxito
     * @example
     * const r = Result.ok(42);
     */
    public static ok<T, E = Error>(value: T): Result<T, E> {
        return new Result<T, E>(true, value, undefined);
    }

    /**
     * Crea un Result fallido.
     * @param error Error
     * @example
     * const r = Result.err(new Error('algo falló'));
     */
    public static err<T, E = Error>(error: E): Result<T, E> {
        return new Result<T, E>(false, undefined, error);
    }

    /**
     * Crea un Result a partir de una función que puede lanzar excepciones.
     * @param fn Función que puede lanzar
     * @param errorTransform Opcional: transforma el error capturado al tipo E
     * @example
     * const r = Result.fromThrowable(() => JSON.parse('{"a":1}'));
     */
    public static fromThrowable<T, E = Error>(
        fn: () => T,
        errorTransform?: (caught: unknown) => E
    ): Result<T, E> {
        try {
            return Result.ok(fn());
        } catch (caught) {
            const error = errorTransform
                ? errorTransform(caught)
                : (caught as E);
            return Result.err(error);
        }
    }

    /**
     * Crea un Result a partir de una Promise.
     * @param promise Promise a envolver
     * @returns Promise<Result<T, E>>
     * @example
     * const result = await Result.fromPromise(fetch('/api'));
     */
    public static async fromPromise<T, E = Error>(
        promise: Promise<T>
    ): Promise<Result<T, E>> {
        try {
            const value = await promise;
            return Result.ok(value);
        } catch (caught) {
            return Result.err(caught as E);
        }
    }

    /**
     * Crea un Result a partir de un valor nullable.
     * Si el valor es null o undefined, retorna un error; si no, retorna éxito.
     * @param value Valor que puede ser null/undefined
     * @param error Error a devolver en caso nulo
     * @example
     * const r = Result.fromNullable(user?.email, new Error('email requerido'));
     */
    public static fromNullable<T, E = Error>(
        value: T | null | undefined,
        error: E
    ): Result<T, E> {
        return value != null ? Result.ok(value) : Result.err(error);
    }

    // ==================== UNWRAPPING ====================

    /**
     * Obtiene el valor interno. Lanza un error si el Result es failure.
     * @throws Error con mensaje genérico
     * @example
     * const value = result.unwrap(); // puede lanzar
     */
    public unwrap(): T {
        if (!this.isSuccess) {
            throw new Error('Called unwrap() on a failed Result');
        }
        return this._value!;
    }

    /**
     * Obtiene el error interno. Lanza un error si el Result es success.
     * @throws Error
     */
    public unwrapError(): E {
        if (!this.isFailure) {
            throw new Error('Called unwrapError() on a successful Result');
        }
        return this._error!;
    }

    /**
     * Obtiene el valor o lanza un error con mensaje personalizado.
     * @param msg Mensaje del error si es failure
     * @example
     * const value = result.expect('No se pudo obtener el usuario');
     */
    public expect(msg: string): T {
        if (!this.isSuccess) {
            throw new Error(msg);
        }
        return this._value!;
    }

    /**
     * Obtiene el valor o un valor por defecto.
     * @param defaultValue Valor por defecto en caso de error
     * @example
     * const port = result.unwrapOr(3000);
     */
    public unwrapOr(defaultValue: T): T {
        return this.isSuccess ? this._value! : defaultValue;
    }

    /**
     * Obtiene el valor o el resultado de una función que recibe el error.
     * @param fn Función que produce valor alternativo
     * @example
     * const value = result.unwrapOrElse(err => {
     *   console.error(err);
     *   return 0;
     * });
     */
    public unwrapOrElse(fn: (error: E) => T): T {
        return this.isSuccess ? this._value! : fn(this._error!);
    }

    // ==================== TRANSFORMATIONS ====================

    /**
     * Transforma el valor exitoso.
     * @param fn Función transformadora
     * @example
     * result.map(x => x * 2)
     */
    public map<U>(fn: (value: T) => U): Result<U, E> {
        return this.isSuccess
            ? Result.ok(fn(this._value!))
            : Result.err(this._error!);
    }

    /**
     * Transforma el error.
     * @param fn Función transformadora
     * @example
     * result.mapError(err => new HttpError(err.message))
     */
    public mapError<F>(fn: (error: E) => F): Result<T, F> {
        return this.isSuccess
            ? Result.ok(this._value!)
            : Result.err(fn(this._error!));
    }

    /**
     * Encadena operaciones que devuelven otro Result (flatMap).
     * @param fn Función que recibe el valor y retorna un nuevo Result
     * @example
     * result.flatMap(val => divide(100, val))
     */
    public flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
        return this.isSuccess
            ? fn(this._value!)
            : Result.err(this._error!);
    }

    /**
     * Versión asíncrona de flatMap.
     * @param fn Función que devuelve una Promise<Result<U, E>>
     * @example
     * await result.flatMapAsync(async val => fetchData(val))
     */
    public async flatMapAsync<U>(
        fn: (value: T) => Promise<Result<U, E>>
    ): Promise<Result<U, E>> {
        return this.isSuccess
            ? await fn(this._value!)
            : Result.err(this._error!);
    }

    /**
     * Versión asíncrona de map.
     * @param fn Función asíncrona que transforma el valor
     * @example
     * await result.mapAsync(async x => await process(x))
     */
    public async mapAsync<U>(
        fn: (value: T) => Promise<U>
    ): Promise<Result<U, E>> {
        return this.isSuccess
            ? Result.ok(await fn(this._value!))
            : Result.err(this._error!);
    }

    /**
     * Pattern matching funcional.
     * @param onSuccess Función para éxito
     * @param onFailure Función para fallo
     * @returns Resultado de la función aplicada
     * @example
     * const message = result.match(
     *   val => `Éxito: ${val}`,
     *   err => `Error: ${err.message}`
     * );
     */
    public match<R>(
        onSuccess: (value: T) => R,
        onFailure: (error: E) => R
    ): R {
        return this.isSuccess
            ? onSuccess(this._value!)
            : onFailure(this._error!);
    }

    /**
     * Alias de match para compatibilidad.
     */
    public fold<R>(
        onSuccess: (value: T) => R,
        onFailure: (error: E) => R
    ): R {
        return this.match(onSuccess, onFailure);
    }

    /**
     * Ejecuta un efecto secundario en éxito, devolviendo el mismo Result.
     * @param fn Función efecto
     */
    public tap(fn: (value: T) => void): Result<T, E> {
        if (this.isSuccess) fn(this._value!);
        return this;
    }

    /**
     * Ejecuta un efecto secundario en fallo, devolviendo el mismo Result.
     * @param fn Función efecto
     */
    public tapError(fn: (error: E) => void): Result<T, E> {
        if (this.isFailure) fn(this._error!);
        return this;
    }

    // ==================== CONVERSIONS ====================

    /**
     * Convierte el Result en una Promise.
     * - Si es éxito, la promesa se resuelve con el valor.
     * - Si es fallo, la promesa se rechaza con el error.
     * @example
     * const promise = result.toPromise();
     * promise.then(console.log).catch(console.error);
     */
    public toPromise(): Promise<T> {
        return this.isSuccess
            ? Promise.resolve(this._value!)
            : Promise.reject(this._error!);
    }

    /**
     * Convierte el Result en un valor nullable.
     * @returns T | null (null si es fallo)
     */
    public toNullable(): T | null {
        return this.isSuccess ? this._value! : null;
    }

    /**
     * Convierte el Result en un valor opcional (undefined en fallo).
     * @returns T | undefined
     */
    public toUndefined(): T | undefined {
        return this.isSuccess ? this._value! : undefined;
    }
}

// ==================== TYPE GUARDS ====================

/**
 * Type guard para Results exitosos.
 * @param result Result a verificar
 */
export function isOk<T, E>(
    result: Result<T, E>
): result is Result<T, E> & { isSuccess: true } {
    return result.isSuccess;
}

/**
 * Type guard para Results fallidos.
 * @param result Result a verificar
 */
export function isFail<T, E>(
    result: Result<T, E>
): result is Result<T, E> & { isFailure: true } {
    return result.isFailure;
}

// ==================== COMBINATORS ====================

/**
 * Combina múltiples Results en uno solo.
 * Si todos son éxito, retorna un Result con array de valores.
 * Si alguno falla, retorna el primer error encontrado.
 * @param results Array de Results
 * @example
 * const combined = combine([Result.ok(1), Result.ok(2)]);
 * combined.unwrap() // [1, 2]
 */
export function combine<T, E>(
    results: Result<T, E>[]
): Result<T[], E> {
    const values: T[] = [];
    for (const r of results) {
        if (r.isFailure) return Result.err(r.unwrapError());
        values.push(r.unwrap());
    }
    return Result.ok(values);
}

/**
 * Combina múltiples Results en una tupla tipada.
 * Versión con soporte para 3 elementos (extensible según necesidades)
 */
export function combineTuple<T1, T2, T3, E>(
    r1: Result<T1, E>,
    r2: Result<T2, E>,
    r3: Result<T3, E>
): Result<[T1, T2, T3], E> {
    if (r1.isFailure) return Result.err(r1.unwrapError());
    if (r2.isFailure) return Result.err(r2.unwrapError());
    if (r3.isFailure) return Result.err(r3.unwrapError());
    return Result.ok([r1.unwrap(), r2.unwrap(), r3.unwrap()]);
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Combina múltiples Results en una tupla tipada.
 * Versión mejorada que soporta hasta 10 elementos (fácilmente extensible).
 */
type ResultTuple<T extends any[], E> = {
    [K in keyof T]: Result<T[K], E>;
};

type UnwrapTuple<T extends any[]> = {
    [K in keyof T]: T[K];
};

export function combineMultipleTuple<T extends any[], E>(
    ...results: ResultTuple<T, E>
): Result<UnwrapTuple<T>, E> {

    const values: any[] = [];

    for (const result of results) {
        if (result.isFailure) {
            return Result.err(result.unwrapError());
        }
        values.push(result.unwrap());
    }

    return Result.ok(values as UnwrapTuple<T>);
}

/**
 * Versión asíncrona de combine.
 * @param promises Array de promesas que resuelven a Result
 */
export async function combinePromises<T, E>(

    promises: Promise<Result<T, E>>[]

): Promise<Result<T[], E>> {

    try {

        const results = await Promise.all(promises);

        return combine(results);

    } catch (caught) {

        return Result.err(caught as E);

    }

}



/**
	
 * Aplica una función que retorna Result a cada elemento de un array y combina los resultados.
	
 * @param items Array de elementos
	
 * @param fn Función que transforma cada elemento en un Result
	
 * @example
	
 * const numbers = [1, 2, 3];
	
 * const results = traverse(numbers, n => divide(10, n));
	
 */

export function traverse<T, U, E>(

    items: T[],

    fn: (item: T) => Result<U, E>

): Result<U[], E> {

    const results: U[] = [];

    for (const item of items) {

        const res = fn(item);

        if (res.isFailure) return Result.err(res.unwrapError());

        results.push(res.unwrap());

    }

    return Result.ok(results);

}



/**
	
 * Separa un array de Results en dos arrays: valores exitosos y errores.
	
 * @param results Array de Results
	
 * @returns [valoresExitosos, errores]
	
 * @example
	
 * const [oks, errs] = partition([Result.ok(1), Result.err('e')]);
	
 * // oks = [1], errs = ['e']
	
 */

export function partition<T, E>(

    results: Result<T, E>[]

): [T[], E[]] {

    const oks: T[] = [];

    const errs: E[] = [];

    for (const r of results) {

        if (r.isSuccess) oks.push(r.unwrap());

        else errs.push(r.unwrapError());

    }

    return [oks, errs];

}