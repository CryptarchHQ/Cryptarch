export function ListPage({
  title,
  description,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar",
  filters,
  headerActions,
  status,
  errorMessage,
  emptyTitle,
  emptyDescription,
  children,
}) {
  return (
    <div className="ca-list-page">
      <header className="ca-list-page__header">
        <div className="ca-list-page__heading">
          <h1 className="ca-list-page__title">{title}</h1>
          {description ? (
            <p className="ca-list-page__description">{description}</p>
          ) : null}
        </div>
        {headerActions ? (
          <div className="ca-list-page__actions">{headerActions}</div>
        ) : null}
      </header>

      <div className="ca-list-page__toolbar">
        <input
          type="search"
          className="ca-list-page__search"
          value={searchValue}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
        {filters ? (
          <div className="ca-list-page__filters">{filters}</div>
        ) : null}
      </div>

      {status === "loading" ? (
        <p className="ca-list-page__loading">Cargando...</p>
      ) : null}

      {status === "empty" ? (
        <div className="ca-list-page__empty">
          {emptyTitle ? <h2>{emptyTitle}</h2> : null}
          {emptyDescription ? <p>{emptyDescription}</p> : null}
        </div>
      ) : null}

      {status === "error" ? (
        <div className="ca-list-page__error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {status === "ready" ? (
        <div className="ca-list-page__content">{children}</div>
      ) : null}
    </div>
  );
}
